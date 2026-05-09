import type { SessionStrategyTagId } from './sessionStrategyTags';

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
export type LoadScale = 'normal' | 'inverse';

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
  /** How to interpret weight progression. Defaults to 'normal'. */
  loadScale?: LoadScale;
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

export const SET_INTENTS = ['warmup', 'working', 'backoff', 'max_test', 'skipped'] as const;
export type SetIntent = (typeof SET_INTENTS)[number];

export type SetLog = {
  id: string;
  sessionLogId: string;
  liftId: string;
  prescriptionId: string;
  setIndex: number;
  /**
   * How you intended this set: warmup accessories, nominal work, backoff, or a true limit test.
   * Defaults to `working` when unset (migration + legacy rows).
   */
  intent?: SetIntent;
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

/** Derived at export and optionally persisted when the user marks a planned day as skipped. */
export const SESSION_STATUSES = ['completed', 'skipped', 'partial', 'ghost'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** Program/session classification (orthogonal to prescribed `mode` / deload toggle). */
export const SESSION_LABEL_TYPES = [
  'accumulation',
  'deload',
  'pr_test',
  'abbreviated',
  'standard',
] as const;
export type SessionLabelType = (typeof SESSION_LABEL_TYPES)[number];

export type SessionLog = {
  id: string;
  /** ISO date YYYY-MM-DD in local time. */
  date: string;
  templateId: TemplateId;
  mode: SessionMode;
  deload: boolean;
  /** How you categorize this workout for analysis. Defaults `standard`. */
  sessionType?: SessionLabelType;
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
  /** Optional strategy tags for this session (how you ran it). See `sessionStrategyTags.ts`. */
  tags?: SessionStrategyTagId[];
  /**
   * Lifecycle / analytics classification. Usually derived from set_logs + prescriptions;
   * persisted when explicitly skipped (`skipped`).
   */
  sessionStatus?: SessionStatus;
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

/** Optional tagging for comparable measurement trends (see mesoAnalysis `bodyMeasurementDelta`). */
export const MEASUREMENT_TIME_OF_DAY = ['morning', 'afternoon', 'evening'] as const;
export type MeasurementTimeOfDay = (typeof MEASUREMENT_TIME_OF_DAY)[number];

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
  /**
   * Free-text conditions for apples-to-apples deltas (e.g. fasted, after bathroom, posture).
   * Omit when unknown; meso analysis requires a consistent non-null protocol across the window for reliable deltas.
   */
  protocol?: string | null;
  timeOfDay?: MeasurementTimeOfDay | null;
};

export type ReadinessLog = {
  id: string;
  sessionLogId: string;
  /** ISO date YYYY-MM-DD. */
  date: string;
  /** Hours of sleep last night. */
  sleepHours: number;
  /** Night interruptions/awakenings counted during sleep. */
  sleepInterruptions?: number;
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
  /**
   * Legacy: mindfulness is now `mindfulness_logs` (multiple entries per day).
   * Kept for deserializing old rows / server payloads.
   */
  mindfulnessMinutes?: number;
  /** ISO timestamp (for ordering in case of multiple). */
  createdAt: string;
};

/** Mindfulness session: optional 1–60 min duration and/or wall-clock log time. */
export type MindfulnessLog = {
  id: string;
  /** Calendar day (local) for filtering. */
  date: string;
  /** ISO timestamp when logged. */
  loggedAt: string;
  /**
   * Session length in minutes (1–60). When omitted, this row is **time-only**
   * (counts toward check-in frequency, 0 min toward duration totals).
   */
  durationMin?: number;
};

export const NUTRITION_DAY_TYPES = ['training', 'rest', 'liss'] as const;
export type NutritionDayType = (typeof NUTRITION_DAY_TYPES)[number];

export type NutritionLog = {
  id: string;
  /** ISO date YYYY-MM-DD. */
  date: string;
  /** Day classification when this row was saved (frozen for export accuracy). */
  dayType?: NutritionDayType;
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

/** Momentary stress check-in: timestamp + 1–5 (higher = more stressed). Multiple per day allowed. */
export type StressLog = {
  id: string;
  /** Calendar day (local) for filtering. */
  date: string;
  /** ISO timestamp when logged. */
  loggedAt: string;
  /** 1 = calm … 5 = very stressed */
  rating: 1 | 2 | 3 | 4 | 5;
  /** Optional note with this check-in. */
  comment?: string;
  /** Heavy parenting / kids-load day. */
  kidsDay?: boolean;
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
  /** Included when `buildRecoveryScore` was called with ≥1 stress check-in for that day. */
  stressScore?: number;
  /** Included when `buildRecoveryScore` was called with ≥1 mindfulness log for that day. */
  mindfulnessScore?: number;
  compositeScore: number;
  band: RecoveryBand;
};
