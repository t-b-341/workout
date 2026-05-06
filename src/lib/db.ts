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
    | 'mindfulness_logs'
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
  mindfulness_logs!: Table<MindfulnessLog, string>;
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

    // v8 — stress check-ins: timestamp + single 1–5 rating; multiple rows per day.
    this.version(8).stores({
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
      stress_logs: 'id, date, loggedAt',
      injury_episodes: 'id, siteKey, startedAt',
      body_readiness_logs: 'id, date',
      dirty: 'id, table, rowId, enqueuedAt',
      meta: 'key',
    }).upgrade(async (tx) => {
      const t = tx.table('stress_logs');
      const rows = await t.toArray();
      await t.clear();
      const clampR = (n: number): 1 | 2 | 3 | 4 | 5 =>
        Math.min(5, Math.max(1, Math.round(n))) as 1 | 2 | 3 | 4 | 5;
      for (const raw of rows) {
        const r = raw as Record<string, unknown>;
        if (r.loggedAt && r.rating != null) {
          await t.put(raw);
          continue;
        }
        const date = String(r.date ?? '');
        const idBase = String(r.id ?? `stress-${date}`);
        const sod = r.startOfDay;
        const mid = r.midDay;
        const eod = r.endOfDay;
        if (
          typeof sod === 'number' &&
          typeof mid === 'number' &&
          typeof eod === 'number'
        ) {
          const slots: Array<{ id: string; loggedAt: string; rating: number }> = [
            { id: `${idBase}-sod`, loggedAt: `${date}T08:00:00.000Z`, rating: sod },
            { id: `${idBase}-mid`, loggedAt: `${date}T14:00:00.000Z`, rating: mid },
            { id: `${idBase}-eod`, loggedAt: `${date}T20:00:00.000Z`, rating: eod },
          ];
          for (const s of slots) {
            await t.put({
              id: s.id,
              date,
              loggedAt: s.loggedAt,
              rating: clampR(s.rating),
            });
          }
        }
      }
    });
    // v9 — mindfulness: timestamped entries (duration 1–60 min optional); migrate from readiness + clear pending meta.
    this.version(9).stores({
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
      stress_logs: 'id, date, loggedAt',
      mindfulness_logs: 'id, date, loggedAt',
      injury_episodes: 'id, siteKey, startedAt',
      body_readiness_logs: 'id, date',
      dirty: 'id, table, rowId, enqueuedAt',
      meta: 'key',
    }).upgrade(async (tx) => {
      const mtable = tx.table('mindfulness_logs');
      const rtable = tx.table('readiness_logs');
      const rows = await rtable.toArray();
      for (const r of rows) {
        const mm = (r as { mindfulnessMinutes?: number }).mindfulnessMinutes;
        if (mm == null || mm <= 0 || !Number.isFinite(mm)) continue;
        const dur = Math.min(60, Math.max(1, Math.round(mm)));
        const rid = (r as { id: string }).id;
        const date = (r as { date: string }).date;
        const createdAt = (r as { createdAt: string }).createdAt;
        await mtable.put({
          id: `mindfulness-migrate-${rid}`,
          date,
          loggedAt: createdAt,
          durationMin: dur,
        });
      }

      const metat = tx.table('meta');
      const metaRows = await metat.toArray();
      for (const row of metaRows) {
        if (String(row.key).startsWith('mindfulness:pending:')) {
          await metat.delete(row.key);
        }
      }
    });
  }
}

export const SCHEMA_VERSION = 9;

let _db: WorkoutDB | null = null;
export function getDb(): WorkoutDB {
  if (!_db) _db = new WorkoutDB();
  return _db;
}
