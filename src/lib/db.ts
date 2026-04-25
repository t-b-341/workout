'use client';

import Dexie, { type Table } from 'dexie';
import type {
  BodyweightLog,
  CardioLog,
  Lift,
  Prescription,
  SessionLog,
  SessionTemplate,
  SetLog,
} from './types';

export type DirtyRow = {
  id: string;
  table: 'prescriptions' | 'session_logs' | 'set_logs' | 'cardio_logs' | 'bodyweight_logs';
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
  dirty!: Table<DirtyRow, string>;
  meta!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('workout');
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
  }
}

let _db: WorkoutDB | null = null;
export function getDb(): WorkoutDB {
  if (!_db) _db = new WorkoutDB();
  return _db;
}
