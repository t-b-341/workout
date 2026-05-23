'use client';

import type { DirtyRow } from './db';
import { getDb } from './db';
import type { SupplementLogExport } from './supplements';
import { buildWorkdayLogsExport } from './workday';
import {
  buildExportSchemaDocumentation,
  EXPORT_SCHEMA_VERSION,
  type ExportedFitnessGoal,
  type MesoAnalysisReport,
} from './exportModelSchema';
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
} from './types';
import {
  SESSION_LABEL_TYPES,
  SET_INTENTS,
} from './types';
import { TRAINING_PLAN_GOALS, type TrainingPlanGoalRow } from './trainingPlanGoals';
import { deriveSessionStatus } from './sessionStatus';
import { todayIso } from './time';

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

function normalizedRpeForExport(rpe: number | undefined): number | null {
  if (rpe == null || Number.isNaN(rpe)) return null;
  const n = Number(rpe);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.min(10, Math.max(1, n));
  return Math.round(clamped * 10) / 10;
}

function buildHrvLogsExport(readiness: ReadinessLog[]): ExportedHrvLog[] {
  return readiness
    .filter((r) => r.hrvRmssd != null && !r.hrvSkipped && Number.isFinite(r.hrvRmssd!))
    .map((r) => ({
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
  cardio_logs: CardioLog[];
  bodyweight_logs: BodyweightLog[];
  body_measurement_logs: BodyMeasurementLog[];
  readiness_logs: ReadinessLog[];
  nutrition_logs: Array<NutritionLog & { dayType: NutritionDayType }>;
  hydration_logs: HydrationLog[];
  sleep_logs: SleepLog[];
  stress_logs: StressLog[];
  cbt_thought_records: CbtThoughtRecord[];
  mindfulness_logs: MindfulnessLog[];
  injury_episodes: InjuryEpisode[];
  body_readiness_logs: BodyReadinessLog[];
  /** Morning RMSSD readings derived from `readiness_logs` (same data as in-app HRV history). */
  hrv_logs: ExportedHrvLog[];
  /** User-defined lifting goals from `user_goals` Dexie table. */
  user_goals: UserGoal[];
  /** Work shift checklist entries from Dexie meta (`workout:workday:v1:*`). */
  workday_logs: ReturnType<typeof buildWorkdayLogsExport>;
  /** Supplement checklist rows from synced `supplement_logs` Dexie table. */
  supplement_logs: SupplementLogExport[];
  /** Current mesocycle block mirror (aligned with Program tab / meso week stats). */
  mesocycle: ReturnType<typeof buildExportMesocycleBlock>;
  dirty: DirtyRow[];
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
  ]);

  const lifts = liftsRaw.map((lift) => ({
    ...lift,
    loadScale: normalizedLoadScale(lift.loadScale),
  }));

  const exportedAtIso = new Date().toISOString();
  const prefs = await loadRecoveryPrefs();

  const dayTypeByDate = new Map(
    nutrition_logs.map((n) => [n.date, dayTypeOf(n, session_logs, cardio_logs)] as const),
  );
  const nutrition_logs_with_day = nutrition_logs.map((n) => {
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
    prescriptions: prescriptions.map((p) => ({
      id: p.id,
      templateId: p.templateId,
      liftId: p.liftId,
      sets: p.sets,
      repMin: p.repMin,
      repMax: p.repMax,
      weight: p.weight,
    })),
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
    mindfulness_logs,
    injury_episodes,
    body_readiness_logs,
    dirty,
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
    db.mindfulness_logs.toArray(),
    db.injury_episodes.toArray(),
    db.body_readiness_logs.toArray(),
    db.dirty.toArray(),
    db.meta.toArray(),
  ]);
  const lifts = liftsRaw.map((lift) => ({
    ...lift,
    loadScale: normalizedLoadScale(lift.loadScale ?? 'normal'),
  }));
  const prescriptions_out = prescriptions.map((p) => ({
    ...p,
    increment: p.increment,
  }));

  const exportedAt = new Date().toISOString();
  const mesoStartNorm = normalizedIsoDateOnly(opts?.mesoStartDate);
  const mesoEndNorm = normalizedIsoDateOnly(opts?.mesoEndDate);
  const mesoConfig = await loadMesoConfig();
  const prefs = await loadRecoveryPrefs();
  const rawGoals = await loadFitnessGoals();
  const fitness_goals = rawGoals.map(exportedFitnessGoal);

  const sessionById = new Map(session_logs.map((s) => [s.id, s]));

  const setsBySessionForStatus = new Map<string, SetLog[]>();
  for (const st of set_logs) {
    const arr = setsBySessionForStatus.get(st.sessionLogId) ?? [];
    arr.push(st);
    setsBySessionForStatus.set(st.sessionLogId, arr);
  }

  const session_logs_out: FullLocalExport['session_logs'] = session_logs.map((s) => ({
    ...s,
    sessionType: opts?.sessionTypeOverrides?.[s.id] ?? sessionTypeOf(s),
    mesoBoundary: s.date === mesoStartNorm ? 'start' : s.date === mesoEndNorm ? 'end' : null,
    sessionStatus: deriveSessionStatus(s, prescriptions, setsBySessionForStatus.get(s.id) ?? []),
  }));

  const set_logs_out: ExportedSetLog[] = set_logs.map((s) => ({
    ...s,
    intent: intentOf(s, opts?.setIntentOverrides),
    date: sessionById.get(s.sessionLogId)?.date ?? null,
    rpe: normalizedRpeForExport(s.rpe),
  }));

  const hrv_logs = buildHrvLogsExport(readiness_logs);
  const workday_logs = buildWorkdayLogsExport(meta);
  const supplementRows = await db.supplement_logs.orderBy('date').toArray();
  const supplement_logs: SupplementLogExport[] = supplementRows.map((r) => ({
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

  const dayTypeByDate = new Map(
    nutrition_logs.map((n) => [n.date, dayTypeOf(n, session_logs_out, cardio_logs)] as const),
  );
  const nutrition_logs_out = nutrition_logs.map((n) => {
    const resolvedDayType = dayTypeOf(n, session_logs_out, cardio_logs);
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

  const extraDatesForRange = [
    ...nutrition_logs.map((n) => n.date),
    ...cardio_logs.map((c) => c.date),
    ...sleep_logs.map((s) => s.date),
    ...stress_logs.map((s) => s.date),
    ...bodyweight_logs.map((b) => b.date),
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

  const user_goals = await db.user_goals.orderBy('createdAt').toArray();

  const mesoAnalysis = computeMesoAnalysis({
    exportedAtIso: exportedAt,
    session_logs,
    set_logs,
    lifts,
    prescriptions: prescriptions.map((p) => ({
      id: p.id,
      templateId: p.templateId,
      liftId: p.liftId,
      sets: p.sets,
      repMin: p.repMin,
      repMax: p.repMax,
      weight: p.weight,
    })),
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
    schemaVersion: EXPORT_SCHEMA_VERSION,
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
    cardio_logs,
    bodyweight_logs,
    body_measurement_logs,
    readiness_logs,
    nutrition_logs: nutrition_logs_out,
    hydration_logs,
    sleep_logs,
    stress_logs,
    cbt_thought_records,
    mindfulness_logs,
    injury_episodes,
    body_readiness_logs,
    hrv_logs,
    user_goals,
    workday_logs,
    supplement_logs,
    mesocycle,
    dirty,
    meta,
  };
}
