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
  | 'olympic'
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
  /** When true, progression system never suggests a weight increase. */
  lockedWeight?: boolean;
  /** Notes shown on the lift card (tempo, cues, etc). */
  notes?: string;
  /** Short coaching cue shown in the set logging card before each set. */
  cue?: string;
  /** Primary + secondary muscles trained. Empty for cardio. */
  muscleGroups?: MuscleGroup[];
  /** Primary movement pattern for coverage charts. */
  pattern?: MovementPattern;
};

export type TemplateId = 'U1' | 'U2' | 'U3' | 'L1' | 'L2' | 'L3' | 'S1' | 'QUICK';

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
  /** Runtime-only (quick session complexes): tags resulting set logs with this Complex.id. */
  complexId?: string;
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
  /** Prescribed rep minimum at time of logging. */
  prescribedRepMin?: number | null;
  /** Prescribed rep maximum at time of logging. */
  prescribedRepMax?: number | null;
  /** Reps in reserve (effort) when reps <= 12. */
  rir?: number;
  /** Derived effort scale where 1 RIR = 9 RPE, 2 RIR = 8 RPE, etc. */
  rpe?: number;
  status: SetStatus;
  /** Subjective bar speed rating logged after the set (working/backoff only). */
  barSpeed?: 'fast' | 'normal' | 'slow' | null;
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
  /** When set as part of a weightlifting complex, the Complex.id it belongs to. */
  complexId?: string;
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
  'opportunistic',
  'coffee',
  'top_set',
] as const;
export type SessionLabelType = (typeof SESSION_LABEL_TYPES)[number];

export type QuickSessionTier = 'coffee' | 'top_set' | 'full';

export type QuickLoadout = {
  id: string;
  userId: string;
  tier: QuickSessionTier;
  label: string;
  liftIds: string[];
  updatedAt: string;
};

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
  /** Wall-clock session length in minutes (set at completion). */
  durationMin?: number | null;
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
  /** Perceived recovery at session start (1–5). 1 = very fatigued, 5 = fully recovered. */
  perceivedRecovery?: number | null;
  /** Optional strategy tags for this session (how you ran it). See `sessionStrategyTags.ts`. */
  tags?: SessionStrategyTagId[];
  /**
   * Lifecycle / analytics classification. Usually derived from set_logs + prescriptions;
   * persisted when explicitly skipped (`skipped`). `null` is the sentinel used to
   * clear a previously persisted status on the server (the upsert payload needs an
   * explicit null because supabase-js strips `undefined` keys from JSON.stringify).
   * Locally treat `null` the same as absent — readers compare to `'skipped'` explicitly.
   */
  sessionStatus?: SessionStatus | null;
};

export type CardioType = 'liss' | 'intervals' | 'occupational';

export type CardioLog = {
  id: string;
  userId?: string;
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
  /** Occupational: shift duration in hours (source of the activity). */
  shiftHours?: number;
};

export type BodyweightLog = {
  id: string;
  userId?: string;
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
  userId?: string;
  /** ISO date YYYY-MM-DD. */
  date: string;
  /** Narrowest point. */
  waist: number;
  /** At navel. */
  abdomen: number;
  /** Widest point. */
  hips: number;
  /** Flexed, largest point. Optional (added later). */
  bicep?: number;
  /** Mid-thigh, relaxed. Optional (added later). */
  thigh?: number;
  /**
   * Free-text conditions for apples-to-apples deltas (e.g. fasted, after bathroom, posture).
   * Omit when unknown; meso analysis requires a consistent non-null protocol across the window for reliable deltas.
   */
  protocol?: string | null;
  timeOfDay?: MeasurementTimeOfDay | null;
};

export type ReadinessLog = {
  id: string;
  userId?: string;
  sessionLogId: string;
  /** ISO date YYYY-MM-DD. */
  date: string;
  /** Hours of sleep last night. */
  sleepHours: number;
  /** Night interruptions/awakenings counted during sleep. */
  sleepInterruptions?: number;
  /**
   * Duration of a nap taken the day before this check-in (min).
   * Undefined or 0 = no nap. Valid values: 20, 30, 60, 90.
   */
  napDurationMin?: number;
  /**
   * Approximate nap timing the day before this check-in.
   * 'early' = before 3pm, 'late' = 3pm or after.
   * Only meaningful when napDurationMin > 0.
   */
  napTiming?: 'early' | 'late';
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
  /** Subjective school/study workload today (0 = none, 1 = light,
   *  2 = moderate, 3 = heavy). Influences session length rec. */
  schoolLoad?: 0 | 1 | 2 | 3;
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
  userId?: string;
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
  userId?: string;
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
  userId?: string;
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
  userId?: string;
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
  userId?: string;
  /** ISO date YYYY-MM-DD. */
  date: string;
  score: 1 | 2 | 3 | 4 | 5;
};

export type SupplementLog = {
  id: string;
  userId: string;
  /** ISO date YYYY-MM-DD. */
  date: string;
  zma: boolean;
  d3k2: boolean;
  multi: boolean;
  creatine: boolean;
  allTaken: boolean;
  updatedAt: string;
};

export type CaffeineLog = {
  id: string;
  userId: string;
  /** YYYY-MM-DD */
  date: string;
  /** ISO timestamp */
  loggedAt: string;
  /** 125 per piece */
  amountMg: number;
  /** 1, 2, 3... */
  pieces: number;
  notes?: string;
  updatedAt: string;
};

export type PullupLog = {
  id: string;
  userId: string;
  /** YYYY-MM-DD */
  date: string;
  /** ISO timestamp when logged */
  loggedAt: string;
  reps: number;
  notes?: string;
  updatedAt: string;
};

export type OralHealthLog = {
  id: string;
  userId: string;
  date: string;
  tongueScrape: boolean;
  brush: boolean;
  floss: boolean;
  mouthwash: boolean;
  allDone: boolean;
  updatedAt: string;
};

export type TrainingChecklistComment = {
  id: string;
  text: string;
  createdAt: string;
};

export type TrainingChecklistItem = {
  id: string;
  userId: string;
  createdAt: string;
  text: string;
  completed: boolean;
  completedAt: string | null;
  comments: TrainingChecklistComment[];
  updatedAt: string;
};

export type GoalMetric = '1rm' | 'working_set' | 'reps' | 'bodyweight';

export type UserGoal = {
  /** e.g. 'goal-dl-1rm-1716000000000' */
  id: string;
  userId: string;
  liftId: string;
  label: string;
  metric: GoalMetric;
  /** lb for weight goals, reps for rep goals */
  targetValue: number;
  /** for working_set metric only */
  targetReps: number | null;
  /** YYYY-MM-DD, optional */
  deadline: string | null;
  /** ISO timestamp when goal was created */
  createdAt: string;
  /** ISO timestamp when goal was first achieved, null if not yet */
  achievedAt: string | null;
  /** Best value at time of creation (snapshot) */
  baselineValue: number;
  /** false = archived */
  active: boolean;
  updatedAt: string;
};

export type StoicCheckin = {
  id: string;
  userId: string;
  date: string;
  tension: string;
  withinControl: string;
  intention: string;
  updatedAt: string;
};

export type StoicMoment = {
  id: string;
  userId: string;
  date: string;
  createdAt: string;
  /** Single free-text field: what's the situation and what is within your control right now? */
  reflection: string;
  /** Optional: what's the one action you can take? */
  action?: string;
  updatedAt: string;
};

export type RelationshipCheckin = {
  id: string;
  userId: string;
  date: string;

  moodState: number;
  anxietyLevel: number;

  connectionRating: number;
  turnedToward: boolean | null;
  expressedAppreciation: boolean | null;
  physicalAffection: boolean | null;

  horsemenAudited: boolean;
  usedCriticism: boolean | null;
  feltContempt: boolean | null;
  wasDefensive: boolean | null;
  stonewalled: boolean | null;
  horsemenNote: string;

  hadConflict: boolean | null;
  conflictRepaired: boolean | null;
  tookResponsibility: boolean | null;

  partnerSeemedDistressed: boolean | null;
  respondedWithCalm: boolean | null;

  isWeeklyReflection: boolean;
  knowsHerInnerWorld: boolean | null;
  askedAboutHerWorld: boolean | null;
  oneThingDifferently: string;

  notes: string;
  updatedAt: string;
};

export type TrainingPhaseMode =
  | 'accumulation'
  | 'maintenance'
  | 'deload';

export type NutritionPhaseMode =
  | 'surplus'
  | 'maintenance'
  | 'deficit';

export type PhaseGoal = {
  id: string;
  /** Display label e.g. "Block 1 — Weeks 1–4" */
  label: string;
  trainingMode: TrainingPhaseMode;
  nutritionMode: NutritionPhaseMode;
  /** YYYY-MM-DD start date */
  startDate: string;
  /** YYYY-MM-DD end date (inclusive) */
  endDate: string;
  /** Calorie target on training days */
  caloriesTraining: number | null;
  /** Calorie target on rest/LISS days */
  caloriesRest: number | null;
  /** Protein target in grams */
  proteinG: number | null;
  notes: string;
  /** True if this phase is currently active based on today's date */
  active: boolean;
  updatedAt: string;
};

export type BlockTemplate = {
  id: string;
  label: string;
  /** ISO date of block Week 1 Monday */
  anchorDate: string;
  /** Total weeks (default 10) */
  totalWeeks: number;
  phases: PhaseGoal[];
  updatedAt: string;
};

export type NamedMesocycle = {
  id: string;
  userId: string;
  label: string;
  /** YYYY-MM-DD inclusive start */
  startDate: string;
  /** YYYY-MM-DD inclusive end */
  endDate: string;
  notes: string;
  updatedAt: string;
};

export type ComplexElement = {
  /** Lift id from the catalog (e.g. 'cl', 'front_squat', 'jk'). */
  liftId: string;
  /** Reps for this element within one round of the complex. */
  reps: number;
};

export type Complex = {
  id: string;
  userId: string;
  label: string;
  /** Ordered sequence of movements performed without dropping the bar. */
  elements: ComplexElement[];
  notes: string;
  updatedAt: string;
};

export type CbtThoughtRecord = {
  id: string;
  userId: string;
  date: string;
  createdAt: string;
  situation: string;
  automaticThought: string;
  emotion: string;
  emotionIntensity: number;
  evidence: string;
  alternativeThought: string;
  stressLogId?: string | null;
  updatedAt: string;
};

/** Momentary stress check-in: timestamp + 1–5 (higher = more stressed). Multiple per day allowed. */
export type StressLog = {
  id: string;
  userId?: string;
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
  /** Work shift logged on this check-in. */
  workDay?: boolean;
};

export type OverwhelmTier = 1 | 2 | 3;

export type OverwhelmEpisode = {
  id: string;
  userId?: string;
  date: string;
  /** ISO timestamp when protocol was opened. */
  startedAt: string;
  /** ISO timestamp when protocol was closed or completed. */
  endedAt?: string;
  /** Tier reached during this episode. */
  tier: OverwhelmTier;
  /** Distress rating before starting the protocol (1–10). */
  distressBefore: number;
  /** Distress rating after completing the protocol (1–10). Optional — user may close early. */
  distressAfter?: number;
  /** Which TIPP steps were completed in Tier 2. */
  tippStepsCompleted?: string[];
  /** Free-text note logged at any tier. */
  note?: string;
  updatedAt: string;
};

export type OverwhelmContact = {
  id: string;
  name: string;
  /** Phone number, text handle, or description of how to reach them. */
  contact: string;
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
