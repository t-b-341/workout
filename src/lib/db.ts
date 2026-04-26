'use client';

import Dexie, { type Table } from 'dexie';
import type {
  BodyweightLog,
  CardioLog,
  Lift,
  Prescription,
  ReadinessLog,
  SessionLog,
  SessionTemplate,
  SetLog,
} from './types';

export type DirtyRow = {
  id: string;
  table:
    | 'prescriptions'
    | 'session_logs'
    | 'set_logs'
    | 'cardio_logs'
    | 'bodyweight_logs'
    | 'readiness_logs';
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
  readiness_logs!: Table<ReadinessLog, string>;
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
      readiness_logs: 'id, sessionLogId, date',
      dirty: 'id, table, rowId, enqueuedAt',
      meta: 'key',
    });
  }
}

export const SCHEMA_VERSION = 2;

let _db: WorkoutDB | null = null;
export function getDb(): WorkoutDB {
  if (!_db) _db = new WorkoutDB();
  return _db;
}
