'use client';

import type { RealtimeChannel } from '@supabase/supabase-js';
import { getDb, type DirtyRow } from './db';
import { createClient } from './supabase/client';
import { LIFTS, PRESCRIPTIONS, TEMPLATES } from './seed';
import type {
  BodyweightLog,
  CardioLog,
  Prescription,
  ReadinessLog,
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
  readiness_logs: 'readiness_logs',
};

const ALL_TABLES: RemoteTable[] = [
  'prescriptions',
  'session_logs',
  'set_logs',
  'cardio_logs',
  'bodyweight_logs',
  'readiness_logs',
];

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
    if (k === 'user_id') continue;
    // Postgres returns absent optional columns as `null`, but local writes
    // store them as `undefined`. Storing `null` here breaks strict-equality
    // checks like `setLog.side === undefined` (where the row was logged
    // without a side, then synced). Drop nulls so optional fields stay
    // `undefined` after a server round-trip.
    if (v === null) continue;
    out[snakeToCamel(k)] = v;
  }
  // We carry updated_at through (as updatedAt) so consumers can do per-field
  // merge if desired. Components ignore unknown fields.
  return out as T;
}

const WATERMARK_PREFIX = 'sync:watermark:';

async function getWatermark(table: RemoteTable): Promise<string | null> {
  const db = getDb();
  const row = await db.meta.get(`${WATERMARK_PREFIX}${table}`);
  return (row?.value as string | undefined) ?? null;
}

async function setWatermark(table: RemoteTable, isoTs: string) {
  const db = getDb();
  await db.meta.put({ key: `${WATERMARK_PREFIX}${table}`, value: isoTs });
}

/** Seed local DB with read-only program data (lifts + templates). Idempotent
 *  upsert so seed changes (new fields like muscleGroups) flow to existing
 *  installs on next boot. */
export async function ensureLocalSeed() {
  const db = getDb();
  await db.lifts.bulkPut(LIFTS);
  await db.templates.bulkPut(TEMPLATES);
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

type RowPayload = Record<string, unknown>;

async function persistRows(table: RemoteTable, rows: RowPayload[]) {
  const db = getDb();
  switch (table) {
    case 'prescriptions':
      await db.prescriptions.bulkPut(rows.map((r) => fromRemote<Prescription>(r)));
      return;
    case 'session_logs':
      await db.session_logs.bulkPut(rows.map((r) => fromRemote<SessionLog>(r)));
      return;
    case 'set_logs':
      await db.set_logs.bulkPut(rows.map((r) => fromRemote<SetLog>(r)));
      return;
    case 'cardio_logs':
      await db.cardio_logs.bulkPut(rows.map((r) => fromRemote<CardioLog>(r)));
      return;
    case 'bodyweight_logs':
      await db.bodyweight_logs.bulkPut(rows.map((r) => fromRemote<BodyweightLog>(r)));
      return;
    case 'readiness_logs':
      await db.readiness_logs.bulkPut(rows.map((r) => fromRemote<ReadinessLog>(r)));
      return;
  }
}

/** Pull rows belonging to the user into local Dexie cache. Uses the
 *  per-table `updated_at` watermark so we only fetch what changed since
 *  last sync. Pass `{ full: true }` to clear and refetch (e.g. after
 *  sign-in or schema reset). */
export async function pullAll(opts: { full?: boolean } = {}) {
  const supabase = createClient();
  const db = getDb();

  for (const table of ALL_TABLES) {
    const watermark = opts.full ? null : await getWatermark(table);

    let q = supabase.from(table).select('*');
    if (watermark) q = q.gt('updated_at', watermark);
    const { data, error } = await q;
    if (error) throw error;

    if (opts.full && !watermark) {
      // First-ever pull (or forced full refresh): clear before rewrite so
      // server-deletes propagate.
      const localTable = db[TABLE_TO_LOCAL[table]];
      // @ts-expect-error dynamic table access
      await localTable.clear();
    }

    const rows = (data ?? []) as RowPayload[];
    if (rows.length > 0) {
      await persistRows(table, rows);
      // Track the highest updated_at we just stored.
      let max = watermark ?? '';
      for (const r of rows) {
        const ts = (r.updated_at as string | undefined) ?? '';
        if (ts > max) max = ts;
      }
      if (max) await setWatermark(table, max);
    } else if (!watermark) {
      // Even an empty first pull should set a watermark so subsequent
      // `pullAll` calls go incremental.
      await setWatermark(table, new Date(0).toISOString());
    }
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

/** Push all dirty rows to Supabase. On 401, attempt one session refresh and
 *  retry; surface anything else. */
export async function flushDirty() {
  const db = getDb();
  const supabase = createClient();
  const dirty = await db.dirty.orderBy('enqueuedAt').toArray();
  if (dirty.length === 0) return;

  let refreshed = false;
  for (const item of dirty) {
    let attempt = 0;
    while (true) {
      attempt++;
      const err = await pushOne(item);
      if (!err) break;

      const status = (err as { status?: number; code?: string }).status;
      const code = (err as { code?: string }).code;
      const isAuth = status === 401 || code === 'PGRST301' || /jwt/i.test(err.message ?? '');
      if (isAuth && !refreshed && attempt === 1) {
        await supabase.auth.refreshSession();
        refreshed = true;
        continue;
      }
      throw err;
    }
    await db.dirty.delete(item.id);
  }
}

async function pushOne(item: DirtyRow): Promise<Error | null> {
  const supabase = createClient();
  const db = getDb();
  if (item.op === 'delete') {
    const { error } = await supabase.from(item.table).delete().eq('id', item.rowId);
    return error ?? null;
  }
  const localTable = db[TABLE_TO_LOCAL[item.table]];
  // @ts-expect-error dynamic table access
  const row = await localTable.get(item.rowId);
  if (!row) return null;
  // Strip any updatedAt we cached from the server — let Supabase set it via
  // its trigger so we don't fight the canonical value.
  const { updatedAt: _ignore, ...rest } = row as Record<string, unknown>;
  void _ignore;
  const { error } = await supabase.from(item.table).upsert(toRemote(rest));
  return error ?? null;
}

export type LocalWriteOpts = {
  /** Don't enqueue for push (use when the row came from a realtime payload). */
  skipDirty?: boolean;
};

/** Local upsert + (by default) enqueue for sync. */
export async function localUpsert<T extends { id: string }>(
  table: RemoteTable,
  row: T,
  opts: LocalWriteOpts = {},
) {
  const db = getDb();
  const localTable = db[TABLE_TO_LOCAL[table]];
  // @ts-expect-error dynamic table access
  await localTable.put(row);
  if (!opts.skipDirty) await enqueueDirty(table, row.id, 'upsert');
}

export async function localDelete(table: RemoteTable, id: string, opts: LocalWriteOpts = {}) {
  const db = getDb();
  const localTable = db[TABLE_TO_LOCAL[table]];
  // @ts-expect-error dynamic table access
  await localTable.delete(id);
  if (!opts.skipDirty) await enqueueDirty(table, id, 'delete');
}

/** Subscribe to Supabase Realtime postgres_changes for every user-scoped
 *  table and mirror them into Dexie without re-enqueuing dirty entries.
 *  Returns an unsubscribe fn. */
export function subscribeRealtime(userId: string): () => void {
  const supabase = createClient();
  const channels: RealtimeChannel[] = [];

  for (const table of ALL_TABLES) {
    const channel = supabase
      .channel(`rt-${table}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
        async (payload: {
          eventType: 'INSERT' | 'UPDATE' | 'DELETE';
          new: RowPayload;
          old: RowPayload;
        }) => {
          try {
            if (payload.eventType === 'DELETE') {
              const id = (payload.old.id as string | undefined) ?? '';
              if (id) await localDelete(table, id, { skipDirty: true });
              return;
            }
            await persistRows(table, [payload.new]);
            const ts = (payload.new.updated_at as string | undefined) ?? '';
            if (ts) {
              const cur = (await getWatermark(table)) ?? '';
              if (ts > cur) await setWatermark(table, ts);
            }
          } catch {
            // Non-fatal; the next periodic pullAll will reconcile.
          }
        },
      )
      .subscribe();
    channels.push(channel);
  }

  return () => {
    for (const ch of channels) supabase.removeChannel(ch);
  };
}

/** Force a full re-pull (clears watermarks + cached rows). Useful after
 *  sign-out / sign-in or when SCHEMA_VERSION changes. */
export async function resetSyncState() {
  const db = getDb();
  for (const table of ALL_TABLES) {
    await db.meta.delete(`${WATERMARK_PREFIX}${table}`);
  }
}
