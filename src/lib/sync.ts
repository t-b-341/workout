'use client';

import { getDb, type DirtyRow } from './db';
import { createClient } from './supabase/client';
import { LIFTS, PRESCRIPTIONS, TEMPLATES } from './seed';
import type {
  BodyweightLog,
  CardioLog,
  Prescription,
  SessionLog,
  SetLog,
} from './types';

type RemoteTable = DirtyRow['table'];

const TABLE_TO_LOCAL: Record<RemoteTable, keyof ReturnType<typeof getDb> & string> = {
  prescriptions: 'prescriptions',
  session_logs: 'session_logs',
  set_logs: 'set_logs',
  cardio_logs: 'cardio_logs',
  bodyweight_logs: 'bodyweight_logs',
};

const camelToSnake = (s: string) => s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
const snakeToCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function toRemote<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[camelToSnake(k)] = v;
  return out;
}
function fromRemote<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'user_id' || k === 'updated_at') continue;
    out[snakeToCamel(k)] = v;
  }
  return out as T;
}

/** Seed local DB with read-only program data (lifts + templates) once. */
export async function ensureLocalSeed() {
  const db = getDb();
  const liftCount = await db.lifts.count();
  if (liftCount === 0) await db.lifts.bulkPut(LIFTS);
  const templateCount = await db.templates.count();
  if (templateCount === 0) await db.templates.bulkPut(TEMPLATES);
}

/** First-time per-user seed of prescriptions on the server. */
export async function seedRemotePrescriptionsIfEmpty(userId: string) {
  const supabase = createClient();
  const { count, error } = await supabase
    .from('prescriptions')
    .select('id', { count: 'exact', head: true });
  if (error) throw error;
  if ((count ?? 0) > 0) return;

  const rows = PRESCRIPTIONS.map((p) => ({
    ...toRemote(p),
    user_id: userId,
  }));
  const { error: insertErr } = await supabase.from('prescriptions').insert(rows);
  if (insertErr) throw insertErr;
}

/** Pull all rows belonging to the user into the local Dexie cache. */
export async function pullAll() {
  const supabase = createClient();
  const db = getDb();

  const tables: Array<[RemoteTable, (rows: unknown[]) => Promise<void>]> = [
    ['prescriptions',   async (r) => { await db.prescriptions.clear();   await db.prescriptions.bulkPut(r.map((x) => fromRemote<Prescription>(x as Record<string, unknown>))); }],
    ['session_logs',    async (r) => { await db.session_logs.clear();    await db.session_logs.bulkPut(r.map((x) => fromRemote<SessionLog>(x as Record<string, unknown>))); }],
    ['set_logs',        async (r) => { await db.set_logs.clear();        await db.set_logs.bulkPut(r.map((x) => fromRemote<SetLog>(x as Record<string, unknown>))); }],
    ['cardio_logs',     async (r) => { await db.cardio_logs.clear();     await db.cardio_logs.bulkPut(r.map((x) => fromRemote<CardioLog>(x as Record<string, unknown>))); }],
    ['bodyweight_logs', async (r) => { await db.bodyweight_logs.clear(); await db.bodyweight_logs.bulkPut(r.map((x) => fromRemote<BodyweightLog>(x as Record<string, unknown>))); }],
  ];

  for (const [tableName, persist] of tables) {
    const { data, error } = await supabase.from(tableName).select('*');
    if (error) throw error;
    await persist((data ?? []) as unknown[]);
  }
}

/** Mark a row dirty so the next flush pushes it. */
export async function enqueueDirty(table: RemoteTable, rowId: string, op: DirtyRow['op'] = 'upsert') {
  const db = getDb();
  await db.dirty.put({
    id: `${table}:${rowId}`,
    table,
    rowId,
    op,
    enqueuedAt: Date.now(),
  });
}

/** Push all dirty rows to Supabase. */
export async function flushDirty() {
  const db = getDb();
  const supabase = createClient();
  const dirty = await db.dirty.orderBy('enqueuedAt').toArray();
  if (dirty.length === 0) return;

  for (const item of dirty) {
    if (item.op === 'delete') {
      const { error } = await supabase.from(item.table).delete().eq('id', item.rowId);
      if (error) throw error;
    } else {
      const localTable = db[TABLE_TO_LOCAL[item.table]];
      // @ts-expect-error dynamic table access
      const row = await localTable.get(item.rowId);
      if (!row) continue;
      const { error } = await supabase.from(item.table).upsert(toRemote(row));
      if (error) throw error;
    }
    await db.dirty.delete(item.id);
  }
}

/** Local upsert + enqueue for sync. */
export async function localUpsert<T extends { id: string }>(
  table: RemoteTable,
  row: T,
) {
  const db = getDb();
  const localTable = db[TABLE_TO_LOCAL[table]];
  // @ts-expect-error dynamic table access
  await localTable.put(row);
  await enqueueDirty(table, row.id, 'upsert');
}

export async function localDelete(table: RemoteTable, id: string) {
  const db = getDb();
  const localTable = db[TABLE_TO_LOCAL[table]];
  // @ts-expect-error dynamic table access
  await localTable.delete(id);
  await enqueueDirty(table, id, 'delete');
}
