import type { Lift, Prescription, SessionTemplate } from './types';

export const LIFTS: Lift[] = [
  // Upper - barbell
  { id: 'pp', name: 'Push Press', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5 },
  { id: 'ohp', name: 'OHP (dead-stop)', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, notes: 'Dead-stop' },
  { id: 'bp', name: 'Bench Press', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5 },
  { id: 'bp_paused', name: 'Bench Press (paused)', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, notes: 'Paused at chest' },
  { id: 'wgbp', name: 'Wide-Grip Bench Press', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5 },
  { id: 'pendlay_row', name: 'Pendlay Row', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5 },
  { id: 'bbr', name: 'Barbell Row', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5 },
  { id: 'deficit_bbr', name: 'Deficit Barbell Row', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5 },
  { id: 'jm_press', name: 'JM Press', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5 },

  // Upper - dumbbell
  { id: 'seated_db_press', name: 'Seated DB Shoulder Press', equipment: 'dumbbell', loadUnit: 'lb', repUnit: 'reps', increment: 2.5 },
  { id: 'pec_flyes', name: 'Pec Flyes', equipment: 'dumbbell', loadUnit: 'lb', repUnit: 'reps', increment: 2.5 },
  { id: 'rdf', name: 'Rear Delt Flyes', equipment: 'dumbbell', loadUnit: 'lb', repUnit: 'reps', increment: 2.5 },
  { id: 'hammer_curls', name: 'Hammer Curls', equipment: 'dumbbell', loadUnit: 'lb', repUnit: 'reps', increment: 2.5 },

  // Upper - bodyweight pullup variants (P1)
  { id: 'p1_eccentric', name: 'P1 Weighted Eccentric', equipment: 'bodyweight', loadUnit: 'lb', repUnit: 'reps', increment: 2.5, notes: '5 sec eccentric, weighted (added load)' },
  { id: 'p1_assisted', name: 'P1 Assisted', equipment: 'bodyweight', loadUnit: 'lb', repUnit: 'reps', increment: 2.5, notes: 'Assisted; weight = assistance lb (negative load)' },
  { id: 'p1_bw', name: 'P1 (Bodyweight)', equipment: 'bodyweight', loadUnit: 'bodyweight', repUnit: 'reps', increment: 2.5, notes: 'Unassisted; tracked as added load (0 = bodyweight)' },

  // Upper - carry
  { id: 'fc', name: "Farmer's Carry (strapped)", equipment: 'carry', loadUnit: 'lb', repUnit: 'lengths', increment: 2.5, notes: 'Per-DB load × lengths (down + back = 2)' },

  // Lower - barbell
  { id: 'back_squat', name: 'Back Squat', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5 },
  { id: 'back_squat_paused', name: 'Back Squat (paused)', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, notes: '3 sec pause' },
  { id: 'breathing_back_squat', name: 'Breathing Back Squat', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, notes: 'Bar on back, breathe between reps' },
  { id: 'dl', name: 'Deadlift', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5 },
  { id: 'ddl', name: 'Deficit Deadlift', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5 },
  { id: 'rdl', name: 'RDL', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5 },

  // Lower - dumbbell
  { id: 'bss', name: 'Bulgarian Split Squat', equipment: 'dumbbell', loadUnit: 'lb', repUnit: 'reps', increment: 2.5 },

  // Core / time-based
  { id: 'planks', name: 'Planks', equipment: 'time', loadUnit: 'none', repUnit: 'seconds', increment: 5, notes: '+5 sec/wk per set' },
  { id: 'ab_rollouts', name: 'Ab Rollouts', equipment: 'bodyweight', loadUnit: 'none', repUnit: 'reps', increment: 1, notes: 'Full ROM; progress reps per set' },

  // Cardio
  { id: 'liss', name: 'LISS', equipment: 'cardio', loadUnit: 'none', repUnit: 'minutes', increment: 1, notes: 'Walk @ 2.0 mph / 3.0% grade' },
  { id: 'echo_intervals', name: 'Echo Bike Intervals', equipment: 'cardio', loadUnit: 'none', repUnit: 'minutes', increment: 1, notes: '8 × 30s sprint / 90s slow; HR target 170 on sprints' },
];

export const TEMPLATES: SessionTemplate[] = [
  { id: 'L1', name: 'Tuesday — Lower (Heavy)',    dayOfWeek: 2, group: 'lower', intensity: 'heavy' },
  { id: 'L2', name: 'Thursday — Lower (Light)',   dayOfWeek: 4, group: 'lower', intensity: 'light' },
  { id: 'L3', name: 'Saturday — Lower (Moderate)',dayOfWeek: 6, group: 'lower', intensity: 'moderate' },
  { id: 'U1', name: 'Monday — Upper (Heavy)',     dayOfWeek: 1, group: 'upper', intensity: 'heavy' },
  { id: 'U2', name: 'Wednesday — Upper (Light)',  dayOfWeek: 3, group: 'upper', intensity: 'light' },
  { id: 'U3', name: 'Friday — Upper (Moderate)',  dayOfWeek: 5, group: 'upper', intensity: 'moderate' },
];

const p = (
  templateId: Prescription['templateId'],
  liftId: string,
  order: number,
  weight: number,
  sets: number,
  repMin: number,
  repMax: number,
  extra: Partial<Prescription> = {},
): Prescription => ({
  id: `${templateId}-${liftId}`,
  templateId,
  liftId,
  order,
  weight,
  sets,
  repMin,
  repMax,
  ...extra,
});

export const PRESCRIPTIONS: Prescription[] = [
  // Monday — U1 (Heavy)
  p('U1', 'pp',           10, 135, 2, 4, 8),
  p('U1', 'ohp',          20, 105, 2, 4, 8),
  p('U1', 'p1_eccentric', 30,   5, 4, 1, 1, { tempo: '5 sec eccentric', notes: 'Start 5–10# added' }),
  p('U1', 'bp',           40, 175, 3, 4, 8),
  p('U1', 'pec_flyes',    50,  17.5, 3, 12, 15),
  p('U1', 'pendlay_row',  60, 170, 3, 4, 8),
  p('U1', 'fc',           70,  52.5, 2, 2, 2, { notes: '52.5# DBs × 2 lengths × 2 sets' }),
  p('U1', 'rdf',          80,  15, 4, 15, 15),

  // Wednesday — U2 (Light)
  p('U2', 'seated_db_press', 10, 40,  3, 8, 12, { notes: 'Shoot for 3×10' }),
  p('U2', 'p1_assisted',     20, 0,   8, 2, 4, { notes: 'Assistance load tracked as positive #' }),
  p('U2', 'wgbp',            30, 125, 3, 8, 12, { notes: 'Shoot for 3×12' }),
  p('U2', 'deficit_bbr',     40, 140, 3, 4, 8),
  p('U2', 'jm_press',        50, 45,  3, 10, 12),
  p('U2', 'hammer_curls',    60, 20,  4, 10, 12),
  p('U2', 'rdf',             70, 15,  4, 15, 15),
  p('U2', 'fc',              80, 52.5, 2, 2, 2, { notes: 'GPP conditioning w/ straps' }),
  p('U2', 'liss',            90, 0,   1, 30, 30, { notes: '30 min @ 2.0 mph / 3.0% grade' }),

  // Friday — U3 (Moderate)
  p('U3', 'pp',           10, 115, 2, 4, 8),
  p('U3', 'ohp',          20,  85, 3, 8, 12),
  p('U3', 'p1_bw',        30,   0, 3, 2, 2, { notes: '3×2 → 4×2 (elbows need to adjust); BW 245#' }),
  p('U3', 'bp_paused',    40, 155, 3, 4, 8),
  p('U3', 'pec_flyes',    50,  17.5, 3, 12, 15),
  p('U3', 'bbr',          60, 150, 3, 4, 8),
  p('U3', 'rdf',          70,  15, 4, 15, 15, { notes: 'Shoulder insurance' }),

  // Tuesday — L1 (Heavy)
  p('L1', 'back_squat',          10, 240, 3, 6, 8, { notes: 'Shoot for 3×8' }),
  p('L1', 'dl',                  20, 325, 3, 3, 6),
  p('L1', 'bss',                 30,  22.5, 2, 6, 8, { perSide: true, notes: 'Shoot for 8; learning' }),
  p('L1', 'breathing_back_squat',40, 165, 1, 15, 20, { notes: 'Bar on back; breathe between reps' }),
  p('L1', 'liss',                50,   0, 1, 30, 30, { notes: '30 min @ 2.0 mph / 3.0% grade' }),

  // Thursday — L2 (Light)
  p('L2', 'rdl',             10, 205, 3, 8, 12, { notes: 'Hinge movement' }),
  p('L2', 'bss',             20,  22.5, 3, 10, 10, { perSide: true, notes: 'Light-day squat stim; learning' }),
  p('L2', 'planks',          30,   0, 3, 30, 30, { notes: '+5 sec/wk per set' }),
  p('L2', 'ab_rollouts',     40,   0, 4, 3, 3, { notes: 'Full ROM; progress reps' }),
  p('L2', 'echo_intervals',  50,   0, 1, 16, 16, { notes: '8 × (30s sprint / 90s slow); HR target 170 sprints' }),
  p('L2', 'liss',            60,   0, 1, 20, 20, { notes: '20 min @ 2.0 mph / 3.0% grade' }),

  // Saturday — L3 (Moderate)
  p('L3', 'back_squat_paused', 10, 205, 3, 3, 6),
  p('L3', 'ddl',               20, 300, 3, 3, 6),
  p('L3', 'bss',               30,  22.5, 2, 6, 8, { perSide: true, notes: 'Shoot for 8; learning' }),
  p('L3', 'liss',              40,   0, 1, 60, 60, { notes: '60 min @ 2.0 mph / 3.0% grade' }),
];

export const DB_INCREMENTS: number[] = (() => {
  const out: number[] = [];
  for (let w = 5; w <= 52.5; w += 2.5) out.push(w);
  return out;
})();

export const CARDIO_WEEKLY_TARGET_MIN = 150;
