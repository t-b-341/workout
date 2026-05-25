'use client';

import { getDb } from './db';
import type { SupplementLogExport } from './supplements';
import { buildWorkdayLogsExport } from './workday';
import {
  buildExportSchemaDocumentation,
  type ExportedFitnessGoal,
  type MesoAnalysisReport,
} from './exportModelSchema';
import { deriveMealMetrics } from './mealTiming';
import { computeExportSummary, enrichProgramTargetsAtExport } from './exportSummary';
import { loadFitnessGoals, type FitnessGoal } from './goals';
import { buildExportMesocycleBlock } from './exportMesocycleBlock';
import { loadMesoConfig } from './mesocycle';
import { computeMesoAnalysis } from './mesoAnalysis';
import { defaultNutritionDayType, resolveNutritionTargetsForDate } from './nutritionDayType';
import { loadExportProgramTargetsForSummary } from './programExportTargets';
import { loadRecoveryPrefs } from './recoveryPrefs';
import type {
  BodyMeasurementLog,
  BodyReadinessLog,
  BodyweightLog,
  CardioLog,
  CbtThoughtRecord,
  StoicCheckin,
  StoicMoment,
  HydrationLog,
  InjuryEpisode,
  Lift,
  MindfulnessLog,
  NutritionDayType,
  NutritionLog,
  Prescription,
  ReadinessLog,
  SessionLabelType,
  SessionLog,
  SessionStatus,
  SessionTemplate,
  SetIntent,
  SetLog,
  SleepLog,
  StressLog,
  UserGoal,
  PhaseGoal,
  BlockTemplate,
  RelationshipCheckin,
  SupplementLog,
  CaffeineLog,
  OralHealthLog,
  TrainingChecklistItem,
} from './types';
import {
  SESSION_LABEL_TYPES,
  SET_INTENTS,
} from './types';
import { TRAINING_PLAN_GOALS, type TrainingPlanGoalRow } from './trainingPlanGoals';
import { deriveSessionStatus } from './sessionStatus';
import { currentValueForGoal, isGoalAchieved } from './liftingGoals';
import { todayIso } from './time';

/** Export payload schema — bump when top-level export shape changes. */
const FULL_LOCAL_EXPORT_SCHEMA_VERSION = 28;

const MEANINGFUL_META_PREFIXES = [
  'workout:supplements:v1:',
  'workout:workday:v1:',
  'recovery:prefs',
  'meso:config',
] as const;

/** Keys this app uses in `localStorage` (UI prefs only; not secrets). */
const KNOWN_LOCALSTORAGE_KEYS = [
  'workout:layout-mode',
  'workout:todayPlan:v1',
  'workout:sundayMondayEarlyUnlock:v1',
] as const;

/** Set row as written to export JSON (parent session date copied; intent always present; RPE clamped 1–10 or null). */
export type ExportedSetLog = Omit<SetLog, 'rpe' | 'intent'> & {
  date: string | null;
  intent: SetIntent;
  rpe: number | null;
};

export type ExportedHrvLog = {
  date: string;
  hrvMs: number;
  source: 'manual' | 'device';
  notes: string | null;
};

type StressDailySummary = {
  date: string;
  avgRating: number;
  checkInCount: number;
  minRating: number;
  maxRating: number;
  workDay: boolean;
  kidsDay: boolean;
  highStress: boolean;
};

type RelationshipWeeklySummary = {
  weekStart: string;
  weekEnd: string;
  daysLogged: number;
  avgConnectionRating: number | null;
  avgMoodAdjustedConnection: number | null;
  horsemenCount: number;
  repairRate: number | null;
  posNegRatio: number | null;
  lowMoodDays: number;
  highAnxietyDays: number;
};

export type ExportedRelationshipCheckin = RelationshipCheckin & {
  moodContextFlag: boolean;
  moodContextNote: 'low-mood-day' | 'high-anxiety-day' | null;
};

export type ExportedNutritionLog = NutritionLog & {
  dayType: NutritionDayType;
  mealOccasions: number;
  firstMealTime: string | null;
  lastMealTime: string | null;
  longestGapMinutes: number | null;
  avgGapMinutes: number | null;
};

export type ExportedCardioLog = CardioLog & {
  avgHrBpm: number | null;
  heartRateZone: 'zone1' | 'zone2' | 'zone3' | 'zone4' | 'zone5' | null;
};

export type ExportedUserGoal = UserGoal & {
  currentValue: number | null;
  pct: number;
  lbsToGo: number | null;
  repsToGo: number | null;
  done: boolean;
};

/** Phase goal row with export-time context for analysis importers. */
export type ExportedPhaseGoal = PhaseGoal & {
  isCurrentlyActive: boolean;
  trainingNutritionSummary: string;
  warningDeloadInDeficit: boolean;
  daysLogged: number;
  avgActualCaloriesTraining: number | null;
  calorieAdherencePct: number | null;
};

function getMondayOfWeek(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function mapPrescriptionsForMesoAnalysis(prescriptions: Prescription[]) {
  return prescriptions.map((p: Prescription) => ({
    id: p.id,
    templateId: p.templateId,
    liftId: p.liftId,
    sets: p.sets,
    repMin: p.repMin,
    repMax: p.repMax,
    weight: p.weight,
    notes: p.notes ?? null,
    increment: p.increment ?? null,
  }));
}

function normalizedRpeForExport(rpe: number | undefined): number | null {
  if (rpe == null || Number.isNaN(rpe)) return null;
  const n = Number(rpe);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.min(10, Math.max(1, n));
  return Math.round(clamped * 10) / 10;
}

function buildHrvLogsExport(readiness: ReadinessLog[]): ExportedHrvLog[] {
  return readiness
    .filter((r: ReadinessLog) => r.hrvRmssd != null && !r.hrvSkipped && Number.isFinite(r.hrvRmssd!))
    .map((r: ReadinessLog) => ({
      date: r.date,
      hrvMs: r.hrvRmssd!,
      source: 'manual' as const,
      notes: null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type FullLocalExportOptions = {
  mesoStartDate?: string | null;
  mesoEndDate?: string | null;
  sessionTypeOverrides?: Record<string, SessionLabelType>;
  setIntentOverrides?: Record<string, SetIntent>;
};

function normalizedIsoDateOnly(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function snapshotKnownLocalStorage(): Record<string, string | null> {
  if (typeof window === 'undefined') return {};
  const out: Record<string, string | null> = {};
  for (const key of KNOWN_LOCALSTORAGE_KEYS) {
    try {
      out[key] = window.localStorage.getItem(key);
    } catch {
      out[key] = null;
    }
  }
  return out;
}

function sessionTypeOf(s: SessionLog): SessionLabelType {
  if (s.sessionType && (SESSION_LABEL_TYPES as readonly string[]).includes(s.sessionType)) {
    return s.sessionType;
  }
  return 'standard';
}

function intentOf(s: SetLog, overrides?: Record<string, SetIntent>): SetIntent {
  const forced = overrides?.[s.id];
  if (forced && (SET_INTENTS as readonly string[]).includes(forced)) return forced;
  if (s.intent && (SET_INTENTS as readonly string[]).includes(s.intent)) return s.intent;
  return 'working';
}

function normalizedLoadScale(loadScale: Lift['loadScale']): 'normal' | 'inverse' {
  return loadScale === 'inverse' ? 'inverse' : 'normal';
}

function dayTypeOf(
  n: NutritionLog,
  sessions: SessionLog[],
  cardio: Array<Pick<CardioLog, 'date' | 'type'>>,
): NutritionDayType {
  return defaultNutritionDayType(n.date, sessions, cardio);
}

function exportedFitnessGoal(g: FitnessGoal): ExportedFitnessGoal {
  const metric = g.metric?.trim();
  const unit = g.unit?.trim();
  const dir =
    g.direction === 'above' || g.direction === 'below' || g.direction === 'exact' ? g.direction : null;
  return {
    id: g.id,
    text: g.text,
    category: g.category,
    metric: metric ? metric : null,
    target: g.target != null && Number.isFinite(g.target) ? g.target : null,
    unit: unit ? unit : null,
    direction: dir,
  };
}

export type FullLocalExport = {
  kind: 'workout-full-local-v1';
  schemaVersion: number;
  /** Field names and types for analysis importers (see `exportModelSchema.ts`). */
  schema: ReturnType<typeof buildExportSchemaDocumentation>;
  summary: ReturnType<typeof computeExportSummary>;
  exportedAt: string;
  mesoAnalysis: MesoAnalysisReport;
  /** Overall program intent from `docs/program.md` (stable snapshot for backups / LLMs). */
  training_plan_goals: TrainingPlanGoalRow[];
  /** User-defined goals from Program tab (with optional numeric targets). */
  fitness_goals: ExportedFitnessGoal[];
  localStorage: Record<string, string | null>;
  lifts: Lift[];
  templates: SessionTemplate[];
  prescriptions: Prescription[];
  session_logs: Array<
    SessionLog & {
      sessionType: SessionLabelType;
      /** Explicit mesocycle boundary marker for export windows chosen by the user. */
      mesoBoundary: 'start' | 'end' | null;
      /** Derived from set_logs + prescriptions at export time. */
      sessionStatus: SessionStatus;
    }
  >;
  set_logs: ExportedSetLog[];
  cardio_logs: ExportedCardioLog[];
  bodyweight_logs: BodyweightLog[];
  body_measurement_logs: BodyMeasurementLog[];
  readiness_logs: ReadinessLog[];
  nutrition_logs: ExportedNutritionLog[];
  hydration_logs: HydrationLog[];
  sleep_logs: SleepLog[];
  stress_logs: StressLog[];
  stress_daily_summaries: StressDailySummary[];
  cbt_thought_records: CbtThoughtRecord[];
  stoic_checkins: StoicCheckin[];
  stoic_moments: StoicMoment[];
  mindfulness_logs: MindfulnessLog[];
  injury_episodes: InjuryEpisode[];
  body_readiness_logs: BodyReadinessLog[];
  /** Morning RMSSD readings derived from `readiness_logs` (same data as in-app HRV history). */
  hrv_logs: ExportedHrvLog[];
  /** User-defined lifting goals with export-time progress. */
  user_goals: ExportedUserGoal[];
  /** Work shift checklist entries from Dexie meta (`workout:workday:v1:*`). */
  workday_logs: ReturnType<typeof buildWorkdayLogsExport>;
  /** Supplement checklist rows from synced `supplement_logs` Dexie table. */
  supplement_logs: SupplementLogExport[];
  caffeine_logs: CaffeineLog[];
  oral_health_logs: OralHealthLog[];
  training_checklist: TrainingChecklistItem[];
  /** Current mesocycle block mirror (aligned with Program tab / meso week stats). */
  mesocycle: ReturnType<typeof buildExportMesocycleBlock>;
  phase_goals: ExportedPhaseGoal[];
  block_templates: BlockTemplate[];
  relationship_checkins: ExportedRelationshipCheckin[];
  relationship_weekly_summaries: RelationshipWeeklySummary[];
  meta: { key: string; value: unknown }[];
};

/** Post-mesocycle analysis for the in-app report (same logic as export `mesoAnalysis`). */
export async function buildMesoAnalysisLive(opts?: FullLocalExportOptions): Promise<MesoAnalysisReport> {
  const db = getDb();
  const [
    liftsRaw,
    prescriptions,
    session_logs,
    set_logs,
    cardio_logs,
    bodyweight_logs,
    body_measurement_logs,
    readiness_logs,
    nutrition_logs,
    sleep_logs,
    stress_logs,
    mindfulness_logs,
    injury_episodes,
  ] = await Promise.all([
    db.lifts.toArray(),
    db.prescriptions.toArray(),
    db.session_logs.toArray(),
    db.set_logs.toArray(),
    db.cardio_logs.toArray(),
    db.bodyweight_logs.toArray(),
    db.body_measurement_logs.toArray(),
    db.readiness_logs.toArray(),
    db.nutrition_logs.toArray(),
    db.sleep_logs.toArray(),
    db.stress_logs.toArray(),
    db.mindfulness_logs.toArray(),
    db.injury_episodes.toArray(),
  ]) as [
    Lift[],
    Prescription[],
    SessionLog[],
    SetLog[],
    CardioLog[],
    BodyweightLog[],
    BodyMeasurementLog[],
    ReadinessLog[],
    NutritionLog[],
    SleepLog[],
    StressLog[],
    MindfulnessLog[],
    InjuryEpisode[],
  ];

  const lifts = liftsRaw.map((lift: Lift) => ({
    ...lift,
    loadScale: normalizedLoadScale(lift.loadScale),
  }));

  const exportedAtIso = new Date().toISOString();
  const prefs = await loadRecoveryPrefs();

  const dayTypeByDate = new Map<string, NutritionDayType>(
    nutrition_logs.map((n: NutritionLog) => [n.date, dayTypeOf(n, session_logs, cardio_logs)] as const),
  );
  const nutrition_logs_with_day = nutrition_logs.map((n: NutritionLog) => {
    const resolvedDayType = dayTypeOf(n, session_logs, cardio_logs);
    const resolvedTargets = resolveNutritionTargetsForDate({
      date: n.date,
      resolvedDayType,
      nutritionLogs: nutrition_logs,
      currentTargets: {
        proteinG: prefs.nutritionTargets.proteinG,
        carbsG: prefs.nutritionTargets.carbsG,
        fatG: prefs.nutritionTargets.fatG,
      },
      resolvedDayTypeByDate: dayTypeByDate,
    });
    return {
      ...n,
      dayType: resolvedDayType,
      caloriesTarget: resolvedTargets.calories,
      proteinTargetG: resolvedTargets.proteinG,
      carbsTargetG: resolvedTargets.carbsG,
      fatTargetG: resolvedTargets.fatG,
    };
  });

  const programTargetsForSummary = await loadExportProgramTargetsForSummary();
  const programTargetsEnriched = enrichProgramTargetsAtExport(
    programTargetsForSummary,
    set_logs,
    prescriptions,
    mindfulness_logs,
  );

  return computeMesoAnalysis({
    exportedAtIso,
    session_logs,
    set_logs,
    lifts,
    prescriptions: mapPrescriptionsForMesoAnalysis(prescriptions),
    readiness_logs,
    bodyweight_logs,
    nutrition_logs: nutrition_logs_with_day,
    sleep_logs,
    stress_logs,
    mindfulness_logs,
    injury_episodes,
    programTargets: programTargetsEnriched,
    body_measurement_logs,
    mesoStartDate: opts?.mesoStartDate,
    mesoEndDate: opts?.mesoEndDate,
  });
}

/** Full IndexedDB + app `localStorage` snapshot for backup or sharing (e.g. with Claude). */
export async function buildFullLocalExport(opts?: FullLocalExportOptions): Promise<FullLocalExport> {
  const db = getDb();
  const [
    liftsRaw,
    templates,
    prescriptions,
    session_logs,
    set_logs,
    cardio_logs,
    bodyweight_logs,
    body_measurement_logs,
    readiness_logs,
    nutrition_logs,
    hydration_logs,
    sleep_logs,
    stress_logs,
    cbt_thought_records,
    stoic_checkins,
    mindfulness_logs,
    injury_episodes,
    body_readiness_logs,
    relationship_checkins,
    phase_goals,
    block_templates,
    meta,
  ] = await Promise.all([
    db.lifts.toArray(),
    db.templates.toArray(),
    db.prescriptions.toArray(),
    db.session_logs.toArray(),
    db.set_logs.toArray(),
    db.cardio_logs.toArray(),
    db.bodyweight_logs.toArray(),
    db.body_measurement_logs.toArray(),
    db.readiness_logs.toArray(),
    db.nutrition_logs.toArray(),
    db.hydration_logs.toArray(),
    db.sleep_logs.toArray(),
    db.stress_logs.toArray(),
    db.cbt_thought_records.orderBy('createdAt').toArray(),
    db.stoic_checkins.orderBy('date').toArray(),
    db.mindfulness_logs.toArray(),
    db.injury_episodes.toArray(),
    db.body_readiness_logs.toArray(),
    db.relationship_checkins.orderBy('date').toArray(),
    db.phase_goals.orderBy('startDate').toArray(),
    db.block_templates.orderBy('anchorDate').toArray(),
    db.meta.toArray(),
  ]) as [
    Lift[],
    SessionTemplate[],
    Prescription[],
    SessionLog[],
    SetLog[],
    CardioLog[],
    BodyweightLog[],
    BodyMeasurementLog[],
    ReadinessLog[],
    NutritionLog[],
    HydrationLog[],
    SleepLog[],
    StressLog[],
    CbtThoughtRecord[],
    StoicCheckin[],
    MindfulnessLog[],
    InjuryEpisode[],
    BodyReadinessLog[],
    RelationshipCheckin[],
    PhaseGoal[],
    BlockTemplate[],
    { key: string; value: unknown }[],
  ];

  const meta_filtered = meta.filter((m: { key: string; value: unknown }) =>
    MEANINGFUL_META_PREFIXES.some((prefix) =>
      (m.key as string).startsWith(prefix),
    ),
  );
  const lifts = liftsRaw.map((lift: Lift) => ({
    ...lift,
    loadScale: normalizedLoadScale(lift.loadScale ?? 'normal'),
  }));
  const prescriptions_out = prescriptions.map((p: Prescription) => ({
    ...p,
    increment: p.increment,
  }));

  const exportedAt = new Date().toISOString();
  const mesoStartNorm = normalizedIsoDateOnly(opts?.mesoStartDate);
  const mesoEndNorm = normalizedIsoDateOnly(opts?.mesoEndDate);
  const mesoConfig = await loadMesoConfig();
  const prefs = await loadRecoveryPrefs();
  const rawGoals = await loadFitnessGoals();
  const fitness_goals = rawGoals.map((g: FitnessGoal) => exportedFitnessGoal(g));

  const sessionById = new Map(session_logs.map((s: SessionLog) => [s.id, s]));

  const setsBySessionForStatus = new Map<string, SetLog[]>();
  for (const st of set_logs) {
    const arr = setsBySessionForStatus.get(st.sessionLogId) ?? [];
    arr.push(st);
    setsBySessionForStatus.set(st.sessionLogId, arr);
  }

  const session_logs_out: FullLocalExport['session_logs'] = session_logs.map((s: SessionLog) => ({
    ...s,
    durationMin: s.durationMin ?? null,
    perceivedRecovery: s.perceivedRecovery ?? null,
    sessionType: opts?.sessionTypeOverrides?.[s.id] ?? sessionTypeOf(s),
    mesoBoundary: s.date === mesoStartNorm ? 'start' : s.date === mesoEndNorm ? 'end' : null,
    sessionStatus: deriveSessionStatus(s, prescriptions, setsBySessionForStatus.get(s.id) ?? []),
  }));

  const cardio_logs_out: ExportedCardioLog[] = cardio_logs.map((c: CardioLog) => ({
    ...c,
    avgHrBpm: c.avgHr ?? null,
    heartRateZone: c.avgHr
      ? c.avgHr < 115
        ? 'zone1'
        : c.avgHr < 135
          ? 'zone2'
          : c.avgHr < 155
            ? 'zone3'
            : c.avgHr < 175
              ? 'zone4'
              : 'zone5'
      : null,
  }));

  const set_logs_out: ExportedSetLog[] = set_logs.map((s: SetLog) => ({
    ...s,
    barSpeed: s.barSpeed ?? null,
    prescribedRepMin: s.prescribedRepMin ?? null,
    prescribedRepMax: s.prescribedRepMax ?? null,
    intent: intentOf(s, opts?.setIntentOverrides),
    date: sessionById.get(s.sessionLogId)?.date ?? null,
    rpe: normalizedRpeForExport(s.rpe),
  }));

  const hrv_logs = buildHrvLogsExport(readiness_logs);
  const workday_logs = buildWorkdayLogsExport(meta);
  const supplementRows = await db.supplement_logs.orderBy('date').toArray();
  const caffeine_logs = (await db.caffeine_logs.toArray())
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
  const oral_health_logs = (await db.oral_health_logs.toArray())
    .sort((a, b) => a.date.localeCompare(b.date));
  const training_checklist = await db.training_checklist
    .orderBy('createdAt').toArray();
  const stoic_moments = await db.stoic_moments.orderBy('createdAt').toArray();
  const supplement_logs: SupplementLogExport[] = supplementRows.map((r: SupplementLog) => ({
    date: r.date,
    zma: r.zma,
    d3k2: r.d3k2,
    multi: r.multi,
    creatine: r.creatine,
    allTaken: r.allTaken,
    updatedAt: r.updatedAt,
  }));
  const mesocycle = buildExportMesocycleBlock({
    cfg: mesoConfig,
    today: todayIso(),
    sessions: session_logs,
    sets: set_logs,
    readiness: readiness_logs,
    lifts,
    bodyweightLogs: bodyweight_logs,
  });

  const dayTypeByDate = new Map<string, NutritionDayType>(
    nutrition_logs.map((n: NutritionLog) => [n.date, dayTypeOf(n, session_logs, cardio_logs)] as const),
  );
  const nutrition_logs_with_day = nutrition_logs.map((n: NutritionLog) => {
    const resolvedDayType = dayTypeOf(n, session_logs, cardio_logs);
    const resolvedTargets = resolveNutritionTargetsForDate({
      date: n.date,
      resolvedDayType,
      nutritionLogs: nutrition_logs,
      currentTargets: {
        proteinG: prefs.nutritionTargets.proteinG,
        carbsG: prefs.nutritionTargets.carbsG,
        fatG: prefs.nutritionTargets.fatG,
      },
      resolvedDayTypeByDate: dayTypeByDate,
    });
    return {
      ...n,
      dayType: resolvedDayType,
      caloriesTarget: resolvedTargets.calories,
      proteinTargetG: resolvedTargets.proteinG,
      carbsTargetG: resolvedTargets.carbsG,
      fatTargetG: resolvedTargets.fatG,
    };
  });

  const nutrition_logs_out: ExportedNutritionLog[] = nutrition_logs_with_day.map((n: NutritionLog & { dayType: NutritionDayType }) => {
    const mealMetrics = deriveMealMetrics(n.mealTimestamps ?? []);
    return {
      ...n,
      mealOccasions: mealMetrics.occasions,
      firstMealTime: mealMetrics.firstMealTimeLabel,
      lastMealTime: mealMetrics.lastMealTimeLabel,
      longestGapMinutes: mealMetrics.longestGapMinutes,
      avgGapMinutes: mealMetrics.avgGapMinutes,
    };
  });

  const stressByDate = new Map<string, StressLog[]>();
  for (const s of stress_logs) {
    const existing = stressByDate.get(s.date) ?? [];
    existing.push(s);
    stressByDate.set(s.date, existing);
  }

  const stress_daily_summaries: StressDailySummary[] = [...stressByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, logs]) => ({
      date,
      avgRating: Math.round(
        (logs.reduce((sum, l) => sum + l.rating, 0) / logs.length) * 10,
      ) / 10,
      checkInCount: logs.length,
      minRating: Math.min(...logs.map((l) => l.rating)),
      maxRating: Math.max(...logs.map((l) => l.rating)),
      workDay: logs.some((l) => l.workDay === true),
      kidsDay: logs.some((l) => l.kidsDay === true),
      highStress: logs.some((l) => l.rating >= 4),
    }));

  const extraDatesForRange = [
    ...nutrition_logs.map((n: NutritionLog) => n.date),
    ...cardio_logs.map((c: CardioLog) => c.date),
    ...sleep_logs.map((s: SleepLog) => s.date),
    ...stress_logs.map((s: StressLog) => s.date),
    ...bodyweight_logs.map((b: BodyweightLog) => b.date),
  ];

  const programTargetsForSummary = await loadExportProgramTargetsForSummary();

  const summary = computeExportSummary({
    exportedAtIso: exportedAt,
    session_logs,
    set_logs,
    lifts,
    readiness_logs,
    bodyweight_logs,
    extraDates: extraDatesForRange,
    mesoConfig,
    programTargets: programTargetsForSummary,
    prescriptions,
    mindfulness_logs,
    mesoStartDate: opts?.mesoStartDate,
    mesoEndDate: opts?.mesoEndDate,
  });

  const userGoalsRaw = (await db.user_goals.toArray())
    .sort((a, b) =>
      (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
    );

  const user_goals: ExportedUserGoal[] = userGoalsRaw.map((goal: UserGoal) => {
    const current = currentValueForGoal(goal, set_logs, bodyweight_logs);
    const done = isGoalAchieved(goal, current);
    const lbsToGo =
      goal.metric !== 'bodyweight' && !done
        ? Math.max(0, goal.targetValue - current)
        : goal.metric === 'bodyweight' && !done
          ? Math.max(0, current - goal.targetValue)
          : 0;
    const repsToGo =
      goal.metric === 'reps' && !done
        ? Math.max(0, goal.targetValue - current)
        : null;
    const pct =
      goal.targetValue > 0
        ? Math.min(100, Math.round(
            goal.metric === 'bodyweight'
              ? ((goal.baselineValue - current)
                / Math.max(1, goal.baselineValue - goal.targetValue)) * 100
              : (current / goal.targetValue) * 100,
          ))
        : 0;
    return {
      ...goal,
      currentValue: current > 0 ? current : null,
      pct,
      lbsToGo: lbsToGo > 0 ? lbsToGo : null,
      repsToGo,
      done,
    };
  });

  const today = todayIso();
  const phase_goals_export: ExportedPhaseGoal[] = phase_goals.map((p: PhaseGoal) => {
    const phaseNutrition = nutrition_logs_with_day.filter(
      (n: NutritionLog & { dayType: NutritionDayType }) =>
        n.date >= p.startDate && n.date <= p.endDate,
    );
    const trainingDayLogs = phaseNutrition.filter(
      (n: NutritionLog & { dayType: NutritionDayType }) => n.dayType === 'training',
    );
    const avgActualCalories =
      trainingDayLogs.length > 0
        ? Math.round(
            trainingDayLogs.reduce(
              (sum: number, n: NutritionLog & { dayType: NutritionDayType }) =>
                sum + (n.caloriesActual ?? 0),
              0,
            )
              / trainingDayLogs.length,
          )
        : null;
    const calorieAdherence =
      avgActualCalories != null && p.caloriesTraining
        ? Math.round((avgActualCalories / p.caloriesTraining) * 100)
        : null;

    return {
      ...p,
      isCurrentlyActive: p.startDate <= today && p.endDate >= today,
      trainingNutritionSummary: `${p.trainingMode} + ${p.nutritionMode}`,
      warningDeloadInDeficit:
        p.trainingMode === 'deload' && p.nutritionMode === 'deficit',
      daysLogged: phaseNutrition.length,
      avgActualCaloriesTraining: avgActualCalories,
      calorieAdherencePct: calorieAdherence,
    };
  });

  const relationship_checkins_export: ExportedRelationshipCheckin[] =
    relationship_checkins.map((c: RelationshipCheckin) => ({
      ...c,
      moodContextFlag: c.moodState <= 2 || c.anxietyLevel >= 4,
      moodContextNote:
        c.moodState <= 2
          ? 'low-mood-day'
          : c.anxietyLevel >= 4
            ? 'high-anxiety-day'
            : null,
    }));

  const checkinsByWeek = new Map<string, RelationshipCheckin[]>();
  for (const c of relationship_checkins) {
    const week = getMondayOfWeek(c.date);
    const existing = checkinsByWeek.get(week) ?? [];
    existing.push(c);
    checkinsByWeek.set(week, existing);
  }

  const relationship_weekly_summaries: RelationshipWeeklySummary[] =
    [...checkinsByWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, logs]) => {
        const weekEnd = new Date(`${weekStart}T00:00:00`);
        weekEnd.setDate(weekEnd.getDate() + 6);

        const connections = logs
          .map((l) => l.connectionRating)
          .filter((r): r is number => r != null && r > 0);
        const avgConn =
          connections.length > 0
            ? Math.round(
                (connections.reduce((a, b) => a + b, 0) / connections.length) * 10,
              ) / 10
            : null;

        const moodAdj = logs
          .filter((l) => l.moodState >= 3)
          .map((l) => l.connectionRating)
          .filter((r): r is number => r != null && r > 0);
        const avgMoodAdj =
          moodAdj.length > 0
            ? Math.round(
                (moodAdj.reduce((a, b) => a + b, 0) / moodAdj.length) * 10,
              ) / 10
            : null;

        const horsemenCount = logs.reduce(
          (sum, l) =>
            sum
            + (l.usedCriticism ? 1 : 0)
            + (l.feltContempt ? 1 : 0)
            + (l.wasDefensive ? 1 : 0)
            + (l.stonewalled ? 1 : 0),
          0,
        );

        const conflicts = logs.filter((l) => l.hadConflict);
        const repaired = conflicts.filter((l) => l.conflictRepaired === true);
        const repairRate =
          conflicts.length > 0
            ? Math.round((repaired.length / conflicts.length) * 100)
            : null;

        const positiveCount = logs.reduce(
          (sum, l) =>
            sum
            + (l.turnedToward ? 1 : 0)
            + (l.expressedAppreciation ? 1 : 0)
            + (l.physicalAffection ? 1 : 0),
          0,
        );
        const negativeCount = horsemenCount;
        const posNegRatio =
          negativeCount > 0
            ? Math.round((positiveCount / negativeCount) * 10) / 10
            : positiveCount > 0
              ? null
              : null;

        return {
          weekStart,
          weekEnd: weekEnd.toISOString().slice(0, 10),
          daysLogged: logs.length,
          avgConnectionRating: avgConn,
          avgMoodAdjustedConnection: avgMoodAdj,
          horsemenCount,
          repairRate,
          posNegRatio,
          lowMoodDays: logs.filter((l) => l.moodState <= 2).length,
          highAnxietyDays: logs.filter((l) => l.anxietyLevel >= 4).length,
        };
      });

  const mesoAnalysis = computeMesoAnalysis({
    exportedAtIso: exportedAt,
    session_logs,
    set_logs,
    lifts,
    prescriptions: mapPrescriptionsForMesoAnalysis(prescriptions),
    readiness_logs,
    bodyweight_logs,
    nutrition_logs: nutrition_logs_out,
    sleep_logs,
    stress_logs,
    mindfulness_logs,
    injury_episodes,
    programTargets: summary.programTargets,
    body_measurement_logs,
    mesoStartDate: opts?.mesoStartDate,
    mesoEndDate: opts?.mesoEndDate,
  });

  return {
    kind: 'workout-full-local-v1',
    schemaVersion: FULL_LOCAL_EXPORT_SCHEMA_VERSION,
    schema: buildExportSchemaDocumentation(),
    summary,
    exportedAt,
    mesoAnalysis,
    training_plan_goals: [...TRAINING_PLAN_GOALS],
    fitness_goals,
    localStorage: snapshotKnownLocalStorage(),
    lifts,
    templates,
    prescriptions: prescriptions_out,
    session_logs: session_logs_out,
    set_logs: set_logs_out,
    cardio_logs: cardio_logs_out,
    bodyweight_logs,
    body_measurement_logs,
    readiness_logs,
    nutrition_logs: nutrition_logs_out,
    hydration_logs,
    sleep_logs,
    stress_logs,
    stress_daily_summaries,
    cbt_thought_records,
    stoic_checkins,
    stoic_moments,
    mindfulness_logs,
    injury_episodes,
    body_readiness_logs,
    hrv_logs,
    user_goals,
    workday_logs,
    supplement_logs,
    caffeine_logs,
    oral_health_logs,
    training_checklist,
    mesocycle,
    phase_goals: phase_goals_export,
    block_templates,
    relationship_checkins: relationship_checkins_export,
    relationship_weekly_summaries,
    meta: meta_filtered,
  };
}
