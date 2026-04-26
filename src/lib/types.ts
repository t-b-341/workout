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
  status: SetStatus;
  substituteLiftId?: string;
  reason?: string;
  /** For per-side lifts. */
  side?: 'L' | 'R';
  /** ISO timestamp the set was logged (for rest timer + session duration). */
  loggedAt?: string;
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
  /** Optional bodyweight logged alongside readiness. */
  bodyweight?: number;
  /** ISO timestamp (for ordering in case of multiple). */
  createdAt: string;
};
