import type { Lift, Prescription, SessionTemplate } from './types';

export const LIFTS: Lift[] = [
  // Upper - barbell
  { id: 'pp', name: 'Push Press', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5,
    notes: 'Cue: dip-and-drive — explosive hip extension launches the bar, arms finish.',
    pattern: 'vert-push', muscleGroups: ['front-delt', 'side-delt', 'triceps', 'core'] },
  { id: 'ohp', name: 'OHP (dead-stop)', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, notes: 'Dead-stop',
    pattern: 'vert-push', muscleGroups: ['front-delt', 'side-delt', 'triceps'] },
  { id: 'wgohp', name: 'Wide-Grip Overhead Press', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, notes: 'Wide grip',
    pattern: 'vert-push', muscleGroups: ['front-delt', 'side-delt', 'triceps'] },
  { id: 'btn_press', name: 'Behind-The-Neck Press', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, notes: 'Wide grip, bar descends behind neck. Requires good shoulder mobility.',
    pattern: 'vert-push', muscleGroups: ['front-delt', 'side-delt', 'triceps'] },
  { id: 'bp', name: 'Bench Press', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5,
    cue: 'Squeeze the bar — tight hands, try to bend the bar outward.',
    pattern: 'horiz-push', muscleGroups: ['chest', 'front-delt', 'triceps'] },
  { id: 'bp_paused', name: 'Bench Press (paused)', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5,
    notes: 'Paused at chest. Cue: leg drive — push floor away at liftoff.',
    cue: 'Squeeze the bar — tight hands, try to bend the bar outward.',
    pattern: 'horiz-push', muscleGroups: ['chest', 'front-delt', 'triceps'] },
  { id: 'wgbp', name: 'Wide-Grip Bench Press', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5,
    cue: 'Squeeze the bar — tight hands, try to bend the bar outward.',
    pattern: 'horiz-push', muscleGroups: ['chest', 'front-delt', 'triceps'] },
  { id: 'cgbp', name: 'Close-Grip Bench Press', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, notes: 'Close grip',
    cue: 'Squeeze the bar — tight hands, try to bend the bar outward.',
    pattern: 'horiz-push', muscleGroups: ['chest', 'front-delt', 'triceps'] },
  { id: 'pendlay_row', name: 'Pendlay Row', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5,
    pattern: 'horiz-pull', muscleGroups: ['lats', 'mid-back', 'rear-delt', 'biceps'] },
  { id: 'bbr', name: 'Barbell Row', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5,
    pattern: 'horiz-pull', muscleGroups: ['lats', 'mid-back', 'rear-delt', 'biceps'] },
  { id: 'deficit_bbr', name: 'Deficit Barbell Row', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5,
    pattern: 'horiz-pull', muscleGroups: ['lats', 'mid-back', 'rear-delt', 'biceps'] },
  { id: 'ubr', name: 'Upright Barbell Row', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5,
    pattern: 'vert-pull', muscleGroups: ['traps', 'side-delt', 'rear-delt', 'biceps'] },
  { id: 'jm_press', name: 'JM Press', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5,
    pattern: 'horiz-push', muscleGroups: ['triceps', 'chest', 'front-delt'] },

  // Upper - dumbbell
  { id: 'seated_db_press', name: 'Seated DB Shoulder Press', equipment: 'dumbbell', loadUnit: 'lb', repUnit: 'reps', increment: 2.5,
    pattern: 'vert-push', muscleGroups: ['front-delt', 'side-delt', 'triceps'] },
  { id: 'pec_flyes', name: 'Pec Flyes', equipment: 'dumbbell', loadUnit: 'lb', repUnit: 'reps', increment: 2.5,
    pattern: 'horiz-push', muscleGroups: ['chest', 'front-delt'] },
  { id: 'rdf', name: 'Rear Delt Plate Flyes', equipment: 'bodyweight', loadUnit: 'lb', repUnit: 'reps', increment: 5, notes: 'Supinated grip; one 10# plate per hand (substitute for DB rear-delt fly)',
    lockedWeight: true, pattern: 'horiz-pull', muscleGroups: ['rear-delt', 'traps'] },
  { id: 'supinated_barbell_curls', name: 'Supinated Barbell Curls', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5,
    pattern: 'horiz-pull', muscleGroups: ['biceps', 'forearms'] },
  { id: 'pronated_barbell_curls', name: 'Pronated Barbell Curls', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, notes: 'Overhand grip',
    pattern: 'horiz-pull', muscleGroups: ['biceps', 'forearms'] },
  { id: 'barbell_wrist_curl', name: 'Barbell Wrist Curl',
    equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps',
    increment: 5, notes: 'Forearm flexor. Palms up, wrists over bench edge.',
    muscleGroups: ['forearms'] },
  { id: 'barbell_wrist_extension', name: 'Barbell Wrist Extension',
    equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps',
    increment: 5, notes: 'Forearm extensor. Palms down, wrists over bench edge.',
    muscleGroups: ['forearms'] },

  // Upper - bodyweight pullup variants (P1). Added-load snap rules: `LIFT_IDS_PULLUP_ADDED_LOAD` in progression.ts.
  { id: 'p1_eccentric', name: 'P1 Weighted Eccentric', equipment: 'bodyweight', loadUnit: 'lb', repUnit: 'reps', increment: 2.5, notes: '5 sec eccentric, weighted (added load)',
    cue: 'Bring the bar to you.',
    pattern: 'vert-pull', muscleGroups: ['lats', 'biceps', 'mid-back'] },
  { id: 'p1_assisted', name: 'P1 Assisted', equipment: 'bodyweight', loadUnit: 'lb', repUnit: 'reps', increment: 5, notes: 'Counterweight assistance in 5 lb steps; lower lb = lighter band / closer to full bodyweight (0 = unassisted), then weighted variants; optional negative for eccentric overload',
    cue: 'Bring the bar to you.',
    loadScale: 'inverse', pattern: 'vert-pull', muscleGroups: ['lats', 'biceps', 'mid-back'] },
  { id: 'p1_bw', name: 'P1 (Bodyweight)', equipment: 'bodyweight', loadUnit: 'bodyweight', repUnit: 'reps', increment: 2.5, notes: 'Unassisted; tracked as added load (0 = bodyweight)',
    cue: 'Bring the bar to you.',
    pattern: 'vert-pull', muscleGroups: ['lats', 'biceps', 'mid-back'] },

  // Lower - barbell
  { id: 'back_squat', name: 'Back Squat', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5,
    cue: 'Squeeze the bar.',
    pattern: 'squat', muscleGroups: ['quads', 'glutes', 'low-back', 'core'] },
  { id: 'back_squat_paused', name: 'Back Squat (paused)', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, notes: '3 sec pause',
    cue: 'Squeeze the bar.',
    pattern: 'squat', muscleGroups: ['quads', 'glutes', 'low-back', 'core'] },
  { id: 'front_squat', name: 'Front Squat', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5,
    cue: 'Squeeze the bar.',
    pattern: 'squat', muscleGroups: ['quads', 'glutes', 'core', 'mid-back'] },
  { id: 'breathing_back_squat', name: 'Breathing Back Squat', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, notes: 'Bar on back, breathe between reps',
    pattern: 'squat', muscleGroups: ['quads', 'glutes', 'low-back', 'core'] },
  { id: 'zercher_squat', name: 'Zercher Squat',
    equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps',
    increment: 5, notes: 'Bar in elbow crease. Upright torso, high elbows throughout.',
    muscleGroups: ['quads', 'glutes', 'core', 'mid-back'] },
  { id: 'dl', name: 'Deadlift', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5,
    cue: 'Leg press the weight away — push the ground down.',
    pattern: 'hinge', muscleGroups: ['hamstrings', 'glutes', 'low-back', 'traps', 'lats'] },
  { id: 'ddl', name: 'Deficit Deadlift', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5,
    cue: 'Leg press the weight away — push the ground down.',
    pattern: 'hinge', muscleGroups: ['hamstrings', 'glutes', 'low-back', 'traps', 'lats'] },
  { id: 'rdl', name: 'RDL', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5,
    pattern: 'hinge', muscleGroups: ['hamstrings', 'glutes', 'low-back'] },
  { id: 'bss', name: 'Bulgarian Split Squat', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5,
    pattern: 'squat', muscleGroups: ['quads', 'glutes', 'hamstrings'],
    notes: 'Barbell; rear foot elevated. Log reps PER LEG — 2×10 means 10 each leg (20 total). Each set is one leg cycle.' },
  { id: 'bonk_carry', name: 'Bonk Carry',
    equipment: 'bodyweight', loadUnit: 'lb', repUnit: 'seconds',
    increment: 5,
    notes: 'Front-loaded carry (person as sandbag). Log load in lb and duration in seconds. Optional: note distance in feet.',
    muscleGroups: ['core', 'traps', 'glutes', 'quads'] },

  // Olympic weightlifting — competition and component lifts
  { id: 'sn', name: 'Snatch', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, lockedWeight: true,
    cue: 'Bar close, finish tall, pull yourself under fast. Lock out aggressive.',
    pattern: 'olympic', muscleGroups: ['quads', 'glutes', 'hamstrings', 'low-back', 'traps', 'side-delt', 'core'] },
  { id: 'cj', name: 'Clean and Jerk', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, lockedWeight: true,
    cue: 'Clean tall and fast under the bar; jerk with the legs, not the arms.',
    pattern: 'olympic', muscleGroups: ['quads', 'glutes', 'hamstrings', 'low-back', 'traps', 'front-delt', 'triceps', 'core'] },
  { id: 'cl', name: 'Clean', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, lockedWeight: true,
    cue: 'Leg press the floor, finish the pull, pull under fast into the rack.',
    pattern: 'olympic', muscleGroups: ['quads', 'glutes', 'hamstrings', 'low-back', 'traps', 'core'] },
  { id: 'jk', name: 'Jerk', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, lockedWeight: true,
    cue: 'Vertical dip, drive through the legs, punch under into the split.',
    pattern: 'olympic', muscleGroups: ['front-delt', 'side-delt', 'triceps', 'quads', 'glutes', 'core'] },
  // Snatch teaching progressions
  { id: 'power_snatch', name: 'Power Snatch', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, lockedWeight: true,
    notes: 'Caught above parallel. Builds pull height and turnover speed.',
    pattern: 'olympic', muscleGroups: ['quads', 'glutes', 'hamstrings', 'low-back', 'traps', 'side-delt', 'core'] },
  { id: 'muscle_snatch', name: 'Muscle Snatch', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, lockedWeight: true,
    notes: 'No re-bend of knees. Builds turnover and overhead strength.',
    pattern: 'olympic', muscleGroups: ['traps', 'side-delt', 'triceps', 'low-back'] },
  { id: 'hang_snatch', name: 'Hang Snatch', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, lockedWeight: true,
    notes: 'From hang (knee/hip). Removes floor complexity, drills second pull.',
    pattern: 'olympic', muscleGroups: ['quads', 'glutes', 'hamstrings', 'traps', 'side-delt', 'core'] },
  { id: 'drop_snatch', name: 'Drop Snatch', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, lockedWeight: true,
    notes: 'From behind neck, drop into overhead squat. Drills speed under the bar.',
    pattern: 'olympic', muscleGroups: ['side-delt', 'triceps', 'quads', 'core'] },
  { id: 'snatch_balance', name: 'Snatch Balance', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, lockedWeight: true,
    notes: 'Dip-drive then drop under into overhead squat. Confidence in the catch.',
    pattern: 'olympic', muscleGroups: ['side-delt', 'triceps', 'quads', 'glutes', 'core'] },
  { id: 'oh_squat', name: 'Overhead Squat', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, lockedWeight: true,
    notes: 'Snatch receiving position. Builds overhead mobility and stability under load.',
    pattern: 'olympic', muscleGroups: ['quads', 'glutes', 'core', 'side-delt', 'traps'] },
  // Clean teaching progressions
  { id: 'power_clean', name: 'Power Clean', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, lockedWeight: true,
    notes: 'Caught above parallel. Builds pull height and turnover.',
    pattern: 'olympic', muscleGroups: ['quads', 'glutes', 'hamstrings', 'low-back', 'traps', 'core'] },
  { id: 'muscle_clean', name: 'Muscle Clean', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, lockedWeight: true,
    notes: 'No re-bend. Drills turnover into the rack.',
    pattern: 'olympic', muscleGroups: ['traps', 'biceps', 'low-back'] },
  { id: 'hang_clean', name: 'Hang Clean', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, lockedWeight: true,
    notes: 'From hang. Drills second pull and turnover.',
    pattern: 'olympic', muscleGroups: ['quads', 'glutes', 'hamstrings', 'traps', 'core'] },
  // Jerk teaching progressions
  { id: 'push_jerk', name: 'Push Jerk', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, lockedWeight: true,
    notes: 'Dip-drive, catch in partial squat (no split). Builds drive and speed under.',
    pattern: 'olympic', muscleGroups: ['front-delt', 'side-delt', 'triceps', 'quads', 'core'] },
  { id: 'split_jerk', name: 'Split Jerk', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, lockedWeight: true,
    cue: 'Vertical dip, drive, punch under into a stable split.',
    pattern: 'olympic', muscleGroups: ['front-delt', 'side-delt', 'triceps', 'quads', 'glutes', 'core'] },
  { id: 'btn_jerk', name: 'Behind-Neck Jerk', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5, lockedWeight: true,
    notes: 'Jerk from behind neck. Reinforces vertical drive and overhead position.',
    pattern: 'olympic', muscleGroups: ['front-delt', 'side-delt', 'triceps', 'quads', 'core'] },

  // Lower - dumbbell
  { id: 'planks', name: 'Planks', equipment: 'time', loadUnit: 'none', repUnit: 'seconds', increment: 5, notes: '+5 sec/wk per set',
    pattern: 'core', muscleGroups: ['core'] },
  { id: 'ab_rollouts', name: 'Ab Rollouts', equipment: 'bodyweight', loadUnit: 'none', repUnit: 'reps', increment: 1, notes: 'Full ROM; progress reps per set',
    pattern: 'core', muscleGroups: ['core', 'lats'] },

  // Cardio
  { id: 'liss', name: 'LISS', equipment: 'cardio', loadUnit: 'none', repUnit: 'minutes', increment: 1, notes: 'Walk @ 2.0 mph / 3.0% grade',
    pattern: 'cardio', muscleGroups: [] },
  { id: 'echo_intervals', name: 'Echo Bike Intervals', equipment: 'cardio', loadUnit: 'none', repUnit: 'minutes', increment: 1, notes: '8 × 30s sprint / 90s slow; HR target 170 on sprints',
    pattern: 'cardio', muscleGroups: [] },
];

export const TEMPLATES: SessionTemplate[] = [
  { id: 'L1', name: 'Tuesday — Lower (Full)',      dayOfWeek: 2, group: 'lower', intensity: 'heavy' },
  { id: 'L2', name: 'Thursday — Lower (Mini)',     dayOfWeek: 4, group: 'lower', intensity: 'light' },
  { id: 'L3', name: 'Saturday — Lower (Mini)',     dayOfWeek: 6, group: 'lower', intensity: 'moderate' },
  { id: 'U1', name: 'Monday — Upper (Full)',       dayOfWeek: 1, group: 'upper', intensity: 'heavy' },
  { id: 'U2', name: 'Wednesday — Upper (Full)',    dayOfWeek: 3, group: 'upper', intensity: 'light' },
  { id: 'U3', name: 'Friday — Upper (Mini)',       dayOfWeek: 5, group: 'upper', intensity: 'moderate' },
  { id: 'S1', name: 'Sunday — Optional',         dayOfWeek: 0, group: 'lower', intensity: 'light' },
  {
    id: 'QUICK',
    name: 'Quick Session',
    dayOfWeek: -1,
    group: 'upper',
    intensity: 'heavy',
  },
];

export const QUICK_DEFAULT_LIFT_IDS: string[] = [
  'dl',
  'back_squat',
  'bp',
  'p1_bw',
  'pendlay_row',
];

/**
 * Program-tab / picker order: **U1, L1, U2, L2, U3, L3, S1** (upper then lower
 * for each day-pair; Sunday optional last). Dexie `templates.toArray()` is otherwise sorted by id
 * (`L*` before `U*`).
 */
export function sortTemplatesProgramOrder<T extends { id: string }>(templates: T[]): T[] {
  const rank = (id: string): number => {
    if (id === 'S1') return 6;
    const m = /^([UL])(\d)$/.exec(id);
    if (!m) return 999;
    const n = parseInt(m[2], 10);
    const upperFirst = m[1] === 'U' ? 0 : 1;
    return (n - 1) * 2 + upperFirst;
  };
  return [...templates].sort((a, b) => rank(a.id) - rank(b.id));
}

/**
 * Default template for "today" on the Today tab / Program picker.
 *
 * `SessionTemplate.dayOfWeek` is ISO-style **1 = Monday … 6 = Saturday**
 * plus **0 = Sunday** (S1). `Date.getDay()` is **0 = Sunday … 6 = Saturday**,
 * so we must not compare them directly.
 *
 * - Mon–Sat: the template whose `dayOfWeek` matches today.
 * - Sunday: S1 when present, otherwise fall back to the smallest `dayOfWeek`.
 */
export function defaultTemplateForLocalDate(
  templates: SessionTemplate[],
  at: Date = new Date(),
): SessionTemplate {
  if (templates.length === 0) {
    return {
      id: 'U1',
      name: 'Monday — Upper (Full)',
      dayOfWeek: 1,
      group: 'upper',
      intensity: 'heavy',
    };
  }
  const schedulable = templates.filter((t) => t.dayOfWeek >= 0);
  const byDow = [...(schedulable.length > 0 ? schedulable : templates)].sort(
    (a, b) => a.dayOfWeek - b.dayOfWeek,
  );
  const js = at.getDay();
  if (js === 0) {
    const sunday = byDow.find((t) => t.dayOfWeek === 0);
    if (sunday) return sunday;
  }
  if (js >= 1 && js <= 6) {
    const hit = byDow.find((t) => t.dayOfWeek === js);
    if (hit) return hit;
  }
  return byDow[0]!;
}

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
  // Monday — U1 (Full Upper, ~12 sets)
  p('U1', 'pp',           10, 145, 2, 3, 6),
  p('U1', 'ohp',          20, 125, 2, 3, 6),
  p('U1', 'p1_eccentric', 30,  20, 5, 1, 1, { tempo: '5 sec eccentric', notes: '5 sec eccentric' }),
  p('U1', 'bp',           40, 175, 3, 4, 8),
  p('U1', 'pendlay_row',  50, 175, 5, 3, 6),
  p('U1', 'rdf',          60,  10, 2, 15, 15, { notes: 'locked weight' }),

  // Tuesday — L1 (Full Lower, ~12 sets)
  p('L1', 'back_squat', 10, 290, 3, 4, 8),
  p('L1', 'dl',         20, 380, 3, 3, 6),
  p('L1', 'bss',        30,  45, 3, 8, 12),
  p('L1', 'rdl',        40, 225, 3, 8, 12),

  // Wednesday — U2 (Full Upper, ~11 sets)
  p('U2', 'bp_paused',   10, 165, 3, 4, 8),
  p('U2', 'bp',          20, 155, 2, 6, 8),
  p('U2', 'wgbp',        30, 135, 3, 8, 12),
  p('U2', 'cgbp',        40, 115, 4, 8, 12),
  p('U2', 'deficit_bbr', 50, 150, 3, 4, 8),
  p('U2', 'rdf',         60,  10, 2, 15, 15, { notes: 'locked weight' }),

  // Thursday — L2 (Mini Lower, ~5 sets)
  p('L2', 'dl',         10, 380, 2, 1, 2),
  p('L2', 'back_squat', 20, 290, 2, 1, 2),
  p('L2', 'rdl',        30, 225, 1, 6, 8),

  // Friday — U3 (Mini Upper, ~6 sets)
  p('U3', 'bp',          10, 175, 2, 1, 2),
  p('U3', 'ohp',         20, 125, 2, 1, 2),
  p('U3', 'pendlay_row', 30, 175, 2, 1, 2),

  // Saturday — L3 (Mini Lower, ~5 sets)
  p('L3', 'back_squat', 10, 290, 2, 1, 2),
  p('L3', 'dl',         20, 380, 2, 1, 2),
  p('L3', 'bss',        30,  45, 1, 6, 8),
];

export const DB_INCREMENTS: number[] = (() => {
  const out: number[] = [];
  for (let w = 5; w <= 52.5; w += 2.5) out.push(w);
  return out;
})();

export const CARDIO_WEEKLY_TARGET_MIN = 150;

/** Legacy default before per-user `wellness:targets:v1` meta; see `wellnessTargets.ts`. */
export const MINDFULNESS_WEEKLY_TARGET_MIN = 60;

/** Display order for movement-pattern coverage charts. */
export const PATTERNS: Array<import('./types').MovementPattern> = [
  'vert-push',
  'horiz-push',
  'vert-pull',
  'horiz-pull',
  'hinge',
  'squat',
  'olympic',
  'carry',
  'core',
  'cardio',
];

/** Display order for muscle-group bar charts. */
export const MUSCLE_GROUPS: Array<import('./types').MuscleGroup> = [
  'chest',
  'front-delt',
  'side-delt',
  'rear-delt',
  'lats',
  'mid-back',
  'traps',
  'biceps',
  'triceps',
  'forearms',
  'low-back',
  'core',
  'glutes',
  'quads',
  'hamstrings',
  'adductors',
  'calves',
];
