'use client';

import type { RealtimeChannel } from '@supabase/supabase-js';
import { getDb, type DirtyRow } from './db';
import { createClient } from './supabase/client';
import { LIFTS, PRESCRIPTIONS, TEMPLATES } from './seed';
import { fromRemote, toRemote } from './syncCodec';
import type {
  BodyMeasurementLog,
  BodyReadinessLog,
  BodyweightLog,
  CardioLog,
  HydrationLog,
  InjuryEpisode,
  NutritionLog,
  Prescription,
  ReadinessLog,
  SessionLog,
  SetLog,
  SleepLog,
  StressLog,
} from './types';

type RemoteTable = DirtyRow['table'];

/** Lower tier = earlier in upsert batch; negate for delete batch (children before parents). */
const FLUSH_TABLE_TIER: Record<RemoteTable, number> = {
  prescriptions: 0,
  session_logs: 1,
  set_logs: 2,
  cardio_logs: 2,
  readiness_logs: 2,
  bodyweight_logs: 3,
  body_measurement_logs: 3,
  nutrition_logs: 3,
  hydration_logs: 3,
  sleep_logs: 3,
  stress_logs: 3,
  injury_episodes: 3,
  body_readiness_logs: 3,
};

/** Order dirty rows so FKs succeed (parents before children on upsert; upserts before deletes). */
export function sortDirtyQueueForFlush(items: DirtyRow[]): DirtyRow[] {
  return [...items].sort((a, b) => {
    const opKey = (op: DirtyRow['op']) => (op === 'upsert' ? 0 : 1);
    const cmpOp = opKey(a.op) - opKey(b.op);
    if (cmpOp !== 0) return cmpOp;

    const tierA = FLUSH_TABLE_TIER[a.table];
    const tierB = FLUSH_TABLE_TIER[b.table];
    const tableKeyA = a.op === 'upsert' ? tierA : -tierA;
    const tableKeyB = b.op === 'upsert' ? tierB : -tierB;
    if (tableKeyA !== tableKeyB) return tableKeyA - tableKeyB;

    return a.enqueuedAt - b.enqueuedAt;
  });
}

const TABLE_TO_LOCAL: Record<RemoteTable, keyof ReturnType<typeof getDb> & string> = {
  prescriptions: 'prescriptions',
  session_logs: 'session_logs',
  set_logs: 'set_logs',
  cardio_logs: 'cardio_logs',
  bodyweight_logs: 'bodyweight_logs',
  body_measurement_logs: 'body_measurement_logs',
  readiness_logs: 'readiness_logs',
  nutrition_logs: 'nutrition_logs',
  hydration_logs: 'hydration_logs',
  sleep_logs: 'sleep_logs',
  stress_logs: 'stress_logs',
  injury_episodes: 'injury_episodes',
  body_readiness_logs: 'body_readiness_logs',
};

const ALL_TABLES: RemoteTable[] = [
  'prescriptions',
  'session_logs',
  'set_logs',
  'cardio_logs',
  'bodyweight_logs',
  'body_measurement_logs',
  'readiness_logs',
  'nutrition_logs',
  'hydration_logs',
  'sleep_logs',
  'stress_logs',
  'injury_episodes',
  'body_readiness_logs',
];

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
    case 'body_measurement_logs':
      await db.body_measurement_logs.bulkPut(rows.map((r) => fromRemote<BodyMeasurementLog>(r)));
      return;
    case 'readiness_logs':
      await db.readiness_logs.bulkPut(rows.map((r) => fromRemote<ReadinessLog>(r)));
      return;
    case 'nutrition_logs':
      await db.nutrition_logs.bulkPut(rows.map((r) => fromRemote<NutritionLog>(r)));
      return;
    case 'hydration_logs':
      await db.hydration_logs.bulkPut(rows.map((r) => fromRemote<HydrationLog>(r)));
      return;
    case 'sleep_logs':
      await db.sleep_logs.bulkPut(rows.map((r) => fromRemote<SleepLog>(r)));
      return;
    case 'stress_logs':
      await db.stress_logs.bulkPut(rows.map((r) => fromRemote<StressLog>(r)));
      return;
    case 'injury_episodes':
      await db.injury_episodes.bulkPut(rows.map((r) => fromRemote<InjuryEpisode>(r)));
      return;
    case 'body_readiness_logs':
      await db.body_readiness_logs.bulkPut(rows.map((r) => fromRemote<BodyReadinessLog>(r)));
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
  const dirty = sortDirtyQueueForFlush(await db.dirty.toArray());
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
  let payload = toRemote(rest) as Record<string, unknown>;
  // Supabase upsert omits undefined keys — cleared locals must send null to wipe RMSSD on skip.
  if (item.table === 'readiness_logs' && (rest as ReadinessLog).hrvSkipped === true) {
    payload = { ...payload, hrv_rmssd: null, hrv_measured_min: null };
  }
  const { error } = await supabase.from(item.table).upsert(payload);
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
