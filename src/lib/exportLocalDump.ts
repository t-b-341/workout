'use client';

import type { DirtyRow } from './db';
import { getDb, SCHEMA_VERSION } from './db';
import type {
  BodyMeasurementLog,
  BodyReadinessLog,
  BodyweightLog,
  CardioLog,
  HydrationLog,
  InjuryEpisode,
  Lift,
  MindfulnessLog,
  NutritionLog,
  Prescription,
  ReadinessLog,
  SessionLog,
  SessionTemplate,
  SetLog,
  SleepLog,
  StressLog,
} from './types';
import { TRAINING_PLAN_GOALS, type TrainingPlanGoalRow } from './trainingPlanGoals';

/** Keys this app uses in `localStorage` (UI prefs only; not secrets). */
const KNOWN_LOCALSTORAGE_KEYS = [
  'workout:layout-mode',
  'workout:todayPlan:v1',
  'workout:sundayMondayEarlyUnlock:v1',
] as const;

export type FullLocalExport = {
  kind: 'workout-full-local-v1';
  schemaVersion: number;
  exportedAt: string;
  /** Overall program intent from `docs/program.md` (stable snapshot for backups / LLMs). */
  training_plan_goals: TrainingPlanGoalRow[];
  localStorage: Record<string, string | null>;
  lifts: Lift[];
  templates: SessionTemplate[];
  prescriptions: Prescription[];
  session_logs: SessionLog[];
  set_logs: SetLog[];
  cardio_logs: CardioLog[];
  bodyweight_logs: BodyweightLog[];
  body_measurement_logs: BodyMeasurementLog[];
  readiness_logs: ReadinessLog[];
  nutrition_logs: NutritionLog[];
  hydration_logs: HydrationLog[];
  sleep_logs: SleepLog[];
  stress_logs: StressLog[];
  mindfulness_logs: MindfulnessLog[];
  injury_episodes: InjuryEpisode[];
  body_readiness_logs: BodyReadinessLog[];
  dirty: DirtyRow[];
  meta: { key: string; value: unknown }[];
};

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

/** Full IndexedDB + app `localStorage` snapshot for backup or sharing (e.g. with Claude). */
export async function buildFullLocalExport(): Promise<FullLocalExport> {
  const db = getDb();
  const [
    lifts,
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

  return {
    kind: 'workout-full-local-v1',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    training_plan_goals: [...TRAINING_PLAN_GOALS],
    localStorage: snapshotKnownLocalStorage(),
    lifts,
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
  };
}
