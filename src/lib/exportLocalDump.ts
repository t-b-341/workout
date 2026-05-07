'use client';

import type { DirtyRow } from './db';
import { getDb, SCHEMA_VERSION } from './db';
import { buildExportSchemaDocumentation, type ExportedFitnessGoal } from './exportModelSchema';
import { computeExportSummary } from './exportSummary';
import { loadFitnessGoals, type FitnessGoal } from './goals';
import { loadMesoConfig } from './mesocycle';
import { defaultNutritionDayType } from './nutritionDayType';
import { loadExportProgramTargetsForSummary } from './programExportTargets';
import type {
  BodyMeasurementLog,
  BodyReadinessLog,
  BodyweightLog,
  CardioLog,
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
  SessionTemplate,
  SetIntent,
  SetLog,
  SleepLog,
  StressLog,
} from './types';
import {
  NUTRITION_DAY_TYPES,
  SESSION_LABEL_TYPES,
  SET_INTENTS,
} from './types';
import { TRAINING_PLAN_GOALS, type TrainingPlanGoalRow } from './trainingPlanGoals';

/** Keys this app uses in `localStorage` (UI prefs only; not secrets). */
const KNOWN_LOCALSTORAGE_KEYS = [
  'workout:layout-mode',
  'workout:todayPlan:v1',
  'workout:sundayMondayEarlyUnlock:v1',
] as const;

/** Set row as written to export JSON (parent session date copied; intent always present). */
export type ExportedSetLog = SetLog & { date: string | null; intent: SetIntent };

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

function intentOf(s: SetLog): SetIntent {
  if (s.intent && (SET_INTENTS as readonly string[]).includes(s.intent)) return s.intent;
  return 'working';
}

function normalizedLoadScale(loadScale: Lift['loadScale']): 'normal' | 'inverse' {
  return loadScale === 'inverse' ? 'inverse' : 'normal';
}

function dayTypeOf(n: NutritionLog, sessions: SessionLog[]): NutritionDayType {
  if (n.dayType && (NUTRITION_DAY_TYPES as readonly string[]).includes(n.dayType)) return n.dayType;
  return defaultNutritionDayType(n.date, sessions);
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
  /** Overall program intent from `docs/program.md` (stable snapshot for backups / LLMs). */
  training_plan_goals: TrainingPlanGoalRow[];
  /** User-defined goals from Program tab (with optional numeric targets). */
  fitness_goals: ExportedFitnessGoal[];
  localStorage: Record<string, string | null>;
  lifts: Lift[];
  templates: SessionTemplate[];
  prescriptions: Prescription[];
  session_logs: Array<SessionLog & { sessionType: SessionLabelType }>;
  set_logs: ExportedSetLog[];
  cardio_logs: CardioLog[];
  bodyweight_logs: BodyweightLog[];
  body_measurement_logs: BodyMeasurementLog[];
  readiness_logs: ReadinessLog[];
  nutrition_logs: Array<NutritionLog & { dayType: NutritionDayType }>;
  hydration_logs: HydrationLog[];
  sleep_logs: SleepLog[];
  stress_logs: StressLog[];
  mindfulness_logs: MindfulnessLog[];
  injury_episodes: InjuryEpisode[];
  body_readiness_logs: BodyReadinessLog[];
  dirty: DirtyRow[];
  meta: { key: string; value: unknown }[];
};

/** Full IndexedDB + app `localStorage` snapshot for backup or sharing (e.g. with Claude). */
export async function buildFullLocalExport(): Promise<FullLocalExport> {
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
    db.mindfulness_logs.toArray(),
    db.injury_episodes.toArray(),
    db.body_readiness_logs.toArray(),
    db.dirty.toArray(),
    db.meta.toArray(),
  ]);
  const lifts = liftsRaw.map((lift) => ({
    ...lift,
    loadScale: normalizedLoadScale(lift.loadScale),
  }));

  const exportedAt = new Date().toISOString();
  const mesoConfig = await loadMesoConfig();
  const rawGoals = await loadFitnessGoals();
  const fitness_goals = rawGoals.map(exportedFitnessGoal);

  const sessionById = new Map(session_logs.map((s) => [s.id, s]));

  const session_logs_out = session_logs.map((s) => ({
    ...s,
    sessionType: sessionTypeOf(s),
  }));

  const set_logs_out: ExportedSetLog[] = set_logs.map((s) => ({
    ...s,
    intent: intentOf(s),
    date: sessionById.get(s.sessionLogId)?.date ?? null,
  }));

  const nutrition_logs_out = nutrition_logs.map((n) => ({
    ...n,
    dayType: dayTypeOf(n, session_logs_out),
  }));

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
  });

  return {
    kind: 'workout-full-local-v1',
    schemaVersion: SCHEMA_VERSION,
    schema: buildExportSchemaDocumentation(),
    summary,
    exportedAt,
    training_plan_goals: [...TRAINING_PLAN_GOALS],
    fitness_goals,
    localStorage: snapshotKnownLocalStorage(),
    lifts,
    templates,
    prescriptions,
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
    mindfulness_logs,
    injury_episodes,
    body_readiness_logs,
    dirty,
    meta,
  };
}
