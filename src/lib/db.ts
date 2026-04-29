'use client';

import Dexie, { type Table } from 'dexie';
import type {
  BodyMeasurementLog,
  BodyReadinessLog,
  BodyweightLog,
  CardioLog,
  HydrationLog,
  InjuryEpisode,
  Lift,
  NutritionLog,
  Prescription,
  ReadinessLog,
  SessionLog,
  SessionTemplate,
  SetLog,
  SleepLog,
  StressLog,
} from './types';

export type DirtyRow = {
  id: string;
  table:
    | 'prescriptions'
    | 'session_logs'
    | 'set_logs'
    | 'cardio_logs'
    | 'bodyweight_logs'
    | 'body_measurement_logs'
    | 'readiness_logs'
    | 'nutrition_logs'
    | 'hydration_logs'
    | 'sleep_logs'
    | 'stress_logs'
    | 'injury_episodes'
    | 'body_readiness_logs';
  rowId: string;
  op: 'upsert' | 'delete';
  /** Server time when last enqueued (for ordering). */
  enqueuedAt: number;
};

export class WorkoutDB extends Dexie {
  lifts!: Table<Lift, string>;
  templates!: Table<SessionTemplate, string>;
  prescriptions!: Table<Prescription, string>;
  session_logs!: Table<SessionLog, string>;
  set_logs!: Table<SetLog, string>;
  cardio_logs!: Table<CardioLog, string>;
  bodyweight_logs!: Table<BodyweightLog, string>;
  body_measurement_logs!: Table<BodyMeasurementLog, string>;
  readiness_logs!: Table<ReadinessLog, string>;
  nutrition_logs!: Table<NutritionLog, string>;
  hydration_logs!: Table<HydrationLog, string>;
  sleep_logs!: Table<SleepLog, string>;
  stress_logs!: Table<StressLog, string>;
  injury_episodes!: Table<InjuryEpisode, string>;
  body_readiness_logs!: Table<BodyReadinessLog, string>;
  dirty!: Table<DirtyRow, string>;
  meta!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('workout');

    // v1 — original schema. NEVER edit a previously released version block.
    this.version(1).stores({
      lifts: 'id, name',
      templates: 'id, dayOfWeek',
      prescriptions: 'id, templateId, liftId, [templateId+order]',
      session_logs: 'id, date, templateId',
      set_logs: 'id, sessionLogId, liftId, [sessionLogId+liftId+setIndex]',
      cardio_logs: 'id, date, sessionLogId',
      bodyweight_logs: 'id, date, isoWeek',
      body_measurement_logs: 'id, date',
      dirty: 'id, table, rowId, enqueuedAt',
      meta: 'key',
    });

    // v2 — add readiness_logs table. Adding non-indexed fields (startedAt on
    // session_logs, loggedAt on set_logs, muscleGroups/pattern on lifts) does
    // not require a Dexie version bump — Dexie stores arbitrary JSON.
    this.version(2).stores({
      lifts: 'id, name',
      templates: 'id, dayOfWeek',
      prescriptions: 'id, templateId, liftId, [templateId+order]',
      session_logs: 'id, date, templateId',
      set_logs: 'id, sessionLogId, liftId, [sessionLogId+liftId+setIndex]',
      cardio_logs: 'id, date, sessionLogId',
      bodyweight_logs: 'id, date, isoWeek',
      body_measurement_logs: 'id, date',
      readiness_logs: 'id, sessionLogId, date',
      dirty: 'id, table, rowId, enqueuedAt',
      meta: 'key',
    });

    // v3 — add recovery-supporting daily signal logs.
    this.version(3).stores({
      lifts: 'id, name',
      templates: 'id, dayOfWeek',
      prescriptions: 'id, templateId, liftId, [templateId+order]',
      session_logs: 'id, date, templateId',
      set_logs: 'id, sessionLogId, liftId, [sessionLogId+liftId+setIndex]',
      cardio_logs: 'id, date, sessionLogId',
      bodyweight_logs: 'id, date, isoWeek',
      body_measurement_logs: 'id, date',
      readiness_logs: 'id, sessionLogId, date',
      nutrition_logs: 'id, date',
      hydration_logs: 'id, date',
      sleep_logs: 'id, date',
      dirty: 'id, table, rowId, enqueuedAt',
      meta: 'key',
    });

    // v4 — add weekly body measurements (waist/abdomen/hips).
    this.version(4).stores({
      lifts: 'id, name',
      templates: 'id, dayOfWeek',
      prescriptions: 'id, templateId, liftId, [templateId+order]',
      session_logs: 'id, date, templateId',
      set_logs: 'id, sessionLogId, liftId, [sessionLogId+liftId+setIndex]',
      cardio_logs: 'id, date, sessionLogId',
      bodyweight_logs: 'id, date, isoWeek',
      body_measurement_logs: 'id, date',
      readiness_logs: 'id, sessionLogId, date',
      nutrition_logs: 'id, date',
      hydration_logs: 'id, date',
      sleep_logs: 'id, date',
      stress_logs: 'id, date',
      dirty: 'id, table, rowId, enqueuedAt',
      meta: 'key',
    });

    // v5 — add daily stress tracking.
    this.version(5).stores({
      lifts: 'id, name',
      templates: 'id, dayOfWeek',
      prescriptions: 'id, templateId, liftId, [templateId+order]',
      session_logs: 'id, date, templateId',
      set_logs: 'id, sessionLogId, liftId, [sessionLogId+liftId+setIndex]',
      cardio_logs: 'id, date, sessionLogId',
      bodyweight_logs: 'id, date, isoWeek',
      body_measurement_logs: 'id, date',
      readiness_logs: 'id, sessionLogId, date',
      nutrition_logs: 'id, date',
      hydration_logs: 'id, date',
      sleep_logs: 'id, date',
      stress_logs: 'id, date',
      dirty: 'id, table, rowId, enqueuedAt',
      meta: 'key',
    });

    // v6 — injury episodes + daily body readiness (injury-aware training).
    this.version(6).stores({
      lifts: 'id, name',
      templates: 'id, dayOfWeek',
      prescriptions: 'id, templateId, liftId, [templateId+order]',
      session_logs: 'id, date, templateId',
      set_logs: 'id, sessionLogId, liftId, [sessionLogId+liftId+setIndex]',
      cardio_logs: 'id, date, sessionLogId',
      bodyweight_logs: 'id, date, isoWeek',
      body_measurement_logs: 'id, date',
      readiness_logs: 'id, sessionLogId, date',
      nutrition_logs: 'id, date',
      hydration_logs: 'id, date',
      sleep_logs: 'id, date',
      stress_logs: 'id, date',
      injury_episodes: 'id, siteKey, startedAt',
      body_readiness_logs: 'id, date',
      dirty: 'id, table, rowId, enqueuedAt',
      meta: 'key',
    });

    // v7 — cardio_logs optional wall-clock fields (same indexes; JSON-only change locally).
    this.version(7).stores({
      lifts: 'id, name',
      templates: 'id, dayOfWeek',
      prescriptions: 'id, templateId, liftId, [templateId+order]',
      session_logs: 'id, date, templateId',
      set_logs: 'id, sessionLogId, liftId, [sessionLogId+liftId+setIndex]',
      cardio_logs: 'id, date, sessionLogId',
      bodyweight_logs: 'id, date, isoWeek',
      body_measurement_logs: 'id, date',
      readiness_logs: 'id, sessionLogId, date',
      nutrition_logs: 'id, date',
      hydration_logs: 'id, date',
      sleep_logs: 'id, date',
      stress_logs: 'id, date',
      injury_episodes: 'id, siteKey, startedAt',
      body_readiness_logs: 'id, date',
      dirty: 'id, table, rowId, enqueuedAt',
      meta: 'key',
    });
  }
}

export const SCHEMA_VERSION = 7;

let _db: WorkoutDB | null = null;
export function getDb(): WorkoutDB {
  if (!_db) _db = new WorkoutDB();
  return _db;
}
