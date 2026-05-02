export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'bodyweight'
  | 'machine'
  | 'band'
  | 'carry'
  | 'cardio'
  | 'time';

export type LoadUnit = 'lb' | 'kg' | 'bodyweight' | 'none';
export type RepUnit = 'reps' | 'seconds' | 'lengths' | 'minutes';

export type MuscleGroup =
  | 'chest'
  | 'front-delt'
  | 'side-delt'
  | 'rear-delt'
  | 'triceps'
  | 'biceps'
  | 'forearms'
  | 'lats'
  | 'traps'
  | 'mid-back'
  | 'low-back'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'adductors'
  | 'calves'
  | 'core';

export type MovementPattern =
  | 'vert-push'
  | 'horiz-push'
  | 'vert-pull'
  | 'horiz-pull'
  | 'hinge'
  | 'squat'
  | 'carry'
  | 'core'
  | 'cardio';

export type Lift = {
  id: string;
  name: string;
  equipment: Equipment;
  loadUnit: LoadUnit;
  repUnit: RepUnit;
  /** Smallest weight increment (lb). 5 for barbell, 2.5 for DB. */
  increment: number;
  /** Notes shown on the lift card (tempo, cues, etc). */
  notes?: string;
  /** Primary + secondary muscles trained. Empty for cardio. */
  muscleGroups?: MuscleGroup[];
  /** Primary movement pattern for coverage charts. */
  pattern?: MovementPattern;
};

export type TemplateId = 'U1' | 'U2' | 'U3' | 'L1' | 'L2' | 'L3';

export type SessionTemplate = {
  id: TemplateId;
  name: string;
  /** 0 = Sun, 1 = Mon, ..., 6 = Sat */
  dayOfWeek: number;
  group: 'upper' | 'lower';
  intensity: 'heavy' | 'light' | 'moderate';
};

export type Prescription = {
  id: string;
  templateId: TemplateId;
  liftId: string;
  order: number;
  /** Current working weight (lb). For BW lifts this is added load (can be 0 or negative for assistance). */
  weight: number;
  sets: number;
  repMin: number;
  repMax: number;
  /** Override the lift's default increment. */
  increment?: number;
  /** Per-leg / per-side logging (BSS). */
  perSide?: boolean;
  /** Tempo / pause text (e.g., "3 sec pause", "5 sec eccentric"). */
  tempo?: string;
  /** Free-text guidance ("shoot for 3x10", "blood flow / practice"). */
  notes?: string;
};

export type SetStatus = 'completed' | 'reduced' | 'skipped' | 'substituted';

export type SetLog = {
  id: string;
  sessionLogId: string;
  liftId: string;
  prescriptionId: string;
  setIndex: number;
  weight: number;
  reps: number;
  /** Reps in reserve (effort) when reps <= 12. */
  rir?: number;
  /** Derived effort scale where 1 RIR = 9 RPE, 2 RIR = 8 RPE, etc. */
  rpe?: number;
  status: SetStatus;
  substituteLiftId?: string;
  reason?: string;
  /** For per-side lifts. */
  side?: 'L' | 'R';
  /** ISO timestamp the set was logged (for rest timer + session duration). */
  loggedAt?: string;
  /** LISS cardio: treadmill speed when logged (mph). */
  speedMph?: number;
  /** LISS cardio: incline when logged (% grade). */
  gradePct?: number;
};

export type SessionMode = 'standard' | 'light' | 'skip';
export type WatchFlag = 'erectors' | 'elbow' | 'shoulder';

export type SessionLog = {
  id: string;
  /** ISO date YYYY-MM-DD in local time. */
  date: string;
  templateId: TemplateId;
  mode: SessionMode;
  deload: boolean;
  reason?: string;
  watchFlags: WatchFlag[];
  notes?: string;
  /** ISO timestamp set on first interaction. */
  startedAt?: string;
  completedAt?: string;
  /** Stopwatch: cumulative paused milliseconds before current pause segment (if any). */
  workoutPausedAccumMs?: number;
  /** Stopwatch: ISO time pause began; elapsed timer freezes until cleared on resume. */
  workoutPausedAt?: string;
  /**
   * Non-RPE effort scaler for this session:
   * -1 = easier, 0 = normal, 1 = harder.
   */
  effortScale?: -1 | 0 | 1;
  /** Set when the readiness check is submitted or skipped — gates History until present. */
  readinessCompletedAt?: string;
};

export type CardioType = 'liss' | 'intervals';

export type CardioLog = {
  id: string;
  sessionLogId?: string;
  /** ISO date YYYY-MM-DD. */
  date: string;
  type: CardioType;
  /** Total minutes (counts toward weekly 150). */
  durationMin: number;
  /** Wall-clock start of this cardio block (ISO). */
  startedAt?: string;
  /** Wall-clock end (ISO), usually when the set was logged. */
  endedAt?: string;
  /** LISS only. */
  speedMph?: number;
  gradePct?: number;
  /** Intervals only. */
  avgHr?: number;
  peakHr?: number;
  notes?: string;
};

export type BodyweightLog = {
  id: string;
  /** ISO date YYYY-MM-DD. */
  date: string;
  /** ISO week string e.g. "2026-W17". */
  isoWeek: string;
  bodyweight: number;
};

export type BodyMeasurementLog = {
  id: string;
  /** ISO date YYYY-MM-DD. */
  date: string;
  /** Narrowest point. */
  waist: number;
  /** At navel. */
  abdomen: number;
  /** Widest point. */
  hips: number;
};

export type ReadinessLog = {
  id: string;
  sessionLogId: string;
  /** ISO date YYYY-MM-DD. */
  date: string;
  /** Hours of sleep last night. */
  sleepHours: number;
  /** 1 = none, 5 = severe. */
  soreness: number;
  /** 1 = dead, 5 = fired up. */
  motivation: number;
  /** Optional morning HRV reading (RMSSD) from a 5-minute measurement. */
  hrvRmssd?: number;
  /** Minutes measured for HRV; default flow is 5 min. */
  hrvMeasuredMin?: number;
  /** True when HRV was intentionally skipped for this check-in. */
  hrvSkipped?: boolean;
  /** Optional bodyweight logged alongside readiness. */
  bodyweight?: number;
  /** Minutes of mindfulness practice today (0–180); app or unguided. */
  mindfulnessMinutes?: number;
  /** ISO timestamp (for ordering in case of multiple). */
  createdAt: string;
};

export type NutritionLog = {
  id: string;
  /** ISO date YYYY-MM-DD. */
  date: string;
  caloriesTarget: number;
  caloriesActual: number;
  proteinTargetG: number;
  proteinActualG: number;
  carbsTargetG: number;
  carbsActualG: number;
  fatTargetG: number;
  fatActualG: number;
  /** Kept in sync with `mealTimestamps.length` when check-ins are used. */
  mealsLoggedCount: number;
  /**
   * ISO timestamps from “Yes, I ate” taps; ordered ascending on save.
   * Absent or empty when only legacy meal count exists.
   */
  mealTimestamps?: string[];
};

export type HydrationLog = {
  id: string;
  /** ISO date YYYY-MM-DD. */
  date: string;
  waterTargetMl: number;
  waterActualMl: number;
  electrolytes: boolean;
  /** 1 = very clear, 8 = very dark. */
  urineColor?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
};

export type SleepLog = {
  id: string;
  /** ISO date YYYY-MM-DD. */
  date: string;
  sleepHours: number;
  /** 1 = poor, 5 = excellent. */
  sleepQuality: 1 | 2 | 3 | 4 | 5;
  sleepOnsetLatencyMin?: number;
  wakeCount?: number;
};

export type InjuryKind = 'acute' | 'chronic';

export type InjuryEpisode = {
  id: string;
  /** Stable body location (e.g. wrist-L, back-low). */
  siteKey: string;
  kind: InjuryKind;
  /** Free text (session context, what happened, etc.). */
  notes?: string;
  /** When the issue was marked active. */
  startedAt: string;
  /** When you cleared the flag; omitted while still active. */
  endedAt?: string;
};

/** Subjective “how’s your body today” for injury-aware training (1 = poor, 5 = great). */
export type BodyReadinessLog = {
  id: string;
  /** ISO date YYYY-MM-DD. */
  date: string;
  score: 1 | 2 | 3 | 4 | 5;
};

export type StressLog = {
  id: string;
  /** ISO date YYYY-MM-DD. */
  date: string;
  /** 1-5 stress at start of day. */
  startOfDay: 1 | 2 | 3 | 4 | 5;
  /** 1-5 stress mid day. */
  midDay: 1 | 2 | 3 | 4 | 5;
  /** 1-5 stress end of day. */
  endOfDay: 1 | 2 | 3 | 4 | 5;
  /** Daily average of the three check-ins. */
  average: number;
  /** Perceived stress-management effectiveness right now (1-5). */
  managementEffectiveness: 1 | 2 | 3 | 4 | 5;
};

export type RecoveryBand = 'push' | 'normal' | 'conservative' | 'recovery';

export type RecoveryPlan = {
  band: RecoveryBand;
  intensityNote: string;
  cardioNote: string;
  nutritionNote: string;
};

export type RecoveryScore = {
  date: string;
  sleepScore: number;
  hydrationScore: number;
  nutritionScore: number;
  readinessScore: number;
  /** Included when `buildRecoveryScore` was called with a stress log for that day. */
  stressScore?: number;
  /** Included when that day’s readiness log had `mindfulnessMinutes` set. */
  mindfulnessScore?: number;
  compositeScore: number;
  band: RecoveryBand;
};
