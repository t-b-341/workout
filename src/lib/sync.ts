'use client';

import type { RealtimeChannel } from '@supabase/supabase-js';
import { getDb, type DirtyRow } from './db';
import { offerDeleteUndo, type UndoRemoteTable } from './deleteUndoCoordinator';
import { createClient } from './supabase/client';
import { LIFTS, PRESCRIPTIONS, TEMPLATES } from './seed';
import { fromRemote, toRemote } from './syncCodec';
import { recordSyncError } from './syncDiagnostics';
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
  CbtThoughtRecord,
  StoicCheckin,
  StoicMoment,
  StressLog,
  SupplementLog,
  CaffeineLog,
  OralHealthLog,
  TrainingChecklistItem,
  UserGoal,
  PhaseGoal,
  BlockTemplate,
  RelationshipCheckin,
} from './types';

export type RemoteTable = DirtyRow['table'];

/** Optional remote catalog tables (when present in Postgres). */
type CatalogPullTable = 'lifts';

/** Tables included in watermark pull; dirty flush uses RemoteTable only. */
type SyncPullTable = RemoteTable | CatalogPullTable;

const CATALOG_PULL_TABLES = new Set<CatalogPullTable>(['lifts']);

function isCatalogPullTable(table: SyncPullTable): table is CatalogPullTable {
  return CATALOG_PULL_TABLES.has(table as CatalogPullTable);
}

function isMissingRelationError(error: { code?: string; message?: string }): boolean {
  const msg = error.message ?? '';
  return (
    error.code === '42P01'
    || error.code === 'PGRST205'
    || /could not find the table/i.test(msg)
    || /schema cache/i.test(msg)
  );
}

function cloneRowForUndo(row: Record<string, unknown>): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
  } catch {
    return { ...row };
  }
}

let _cachedUserId: string | null = null;

if (typeof window !== 'undefined') {
  const _supabase = createClient();
  _supabase.auth.onAuthStateChange((_, session) => {
    _cachedUserId = session?.user?.id ?? null;
  });
}

async function getAuthUserId(): Promise<string | null> {
  if (_cachedUserId) return _cachedUserId;

  const supabase = createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user?.id) {
    _cachedUserId = session.user.id;
    return _cachedUserId;
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) {
      _cachedUserId = user.id;
      return _cachedUserId;
    }
  } catch {
    // Network unavailable — continue without userId
  }

  return null;
}

/** Prime from a server-verified user before child components write rows. */
export function setCachedUserId(id: string | null) {
  _cachedUserId = id;
}

/** Call on sign-out to clear the cached user. */
export function clearCachedUserId() {
  _cachedUserId = null;
}

/** Local rows use camelCase `userId`; `toRemote` maps it to Postgres `user_id`. */
function withUserIdLocal<T extends { id: string }>(row: T, userId: string | null): T {
  return userId ? { ...row, userId } : row;
}

function withUserIdRemote(payload: Record<string, unknown>, userId: string | null): Record<string, unknown> {
  return userId ? { ...payload, user_id: userId } : payload;
}

/**
 * Tables whose local primary keys are built from non-user-scoped values
 * (e.g. `nutrition-${date}`, `bw-${date}`, the seeded `L1` / `U1` templates).
 *
 * Without per-user scoping these collide across users on the server, so a
 * second user's upsert hits `ON CONFLICT DO UPDATE` and silently no-ops
 * because the existing row's `user_id` doesn't match `auth.uid()` under
 * RLS. The Supabase client returns no error and the dirty queue entry is
 * removed — every write looks successful but never lands.
 *
 * Local Dexie keeps the bare id; `remoteIdFor` adds `${userId}:` on push
 * and `localIdFor` strips it on pull / realtime so call sites stay simple.
 */
const USER_SCOPED_ID_TABLES: ReadonlySet<RemoteTable> = new Set<RemoteTable>([
  'templates',
  'nutrition_logs',
  'hydration_logs',
  'bodyweight_logs',
  'oral_health_logs',
  'sleep_logs',
  'stoic_checkins',
  'relationship_checkins',
  'body_measurement_logs',
  'supplement_logs',
]);

export function remoteIdFor(
  table: RemoteTable,
  localId: string,
  userId: string | null,
): string {
  if (!userId) return localId;
  if (!USER_SCOPED_ID_TABLES.has(table)) return localId;
  if (localId.startsWith(`${userId}:`)) return localId;
  return `${userId}:${localId}`;
}

export function localIdFor(table: string, remoteId: string): string {
  if (!USER_SCOPED_ID_TABLES.has(table as RemoteTable)) return remoteId;
  const colon = remoteId.indexOf(':');
  if (colon < 0) return remoteId;
  return remoteId.slice(colon + 1);
}
const FLUSH_TABLE_TIER: Record<RemoteTable, number> = {
  templates: 0,
  prescriptions: 0,
  phase_goals: 1,
  block_templates: 1,
  training_checklist: 1,
  user_goals: 1,
  relationship_checkins: 2,
  caffeine_logs: 2,
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
  cbt_thought_records: 2,
  stoic_checkins: 2,
  stoic_moments: 2,
  mindfulness_logs: 3,
  injury_episodes: 3,
  body_readiness_logs: 3,
  supplement_logs: 3,
  oral_health_logs: 3,
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

const TABLE_TO_LOCAL: Record<SyncPullTable, keyof ReturnType<typeof getDb> & string> = {
  templates: 'templates',
  prescriptions: 'prescriptions',
  lifts: 'lifts',
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
  cbt_thought_records: 'cbt_thought_records',
  stoic_checkins: 'stoic_checkins',
  stoic_moments: 'stoic_moments',
  mindfulness_logs: 'mindfulness_logs',
  injury_episodes: 'injury_episodes',
  body_readiness_logs: 'body_readiness_logs',
  supplement_logs: 'supplement_logs',
  caffeine_logs: 'caffeine_logs',
  oral_health_logs: 'oral_health_logs',
  training_checklist: 'training_checklist',
  user_goals: 'user_goals',
  phase_goals: 'phase_goals',
  block_templates: 'block_templates',
  relationship_checkins: 'relationship_checkins',
};

/**
 * Tables synced via watermark pull and realtime subscription.
 * hrv_logs → readiness_logs; workday_logs → Dexie meta only.
 */
const ALL_TABLES: SyncPullTable[] = [
  'templates',
  'prescriptions',
  'lifts',
  'session_logs',
  'set_logs',
  'readiness_logs',
  'sleep_logs',
  'stress_logs',
  'cbt_thought_records',
  'stoic_checkins',
  'stoic_moments',
  'nutrition_logs',
  'hydration_logs',
  'bodyweight_logs',
  'body_measurement_logs',
  'body_readiness_logs',
  'mindfulness_logs',
  'cardio_logs',
  'injury_episodes',
  'supplement_logs',
  'user_goals',
  'phase_goals',
  'block_templates',
  'relationship_checkins',
  'caffeine_logs',
  'oral_health_logs',
  'training_checklist',
];

const WATERMARK_PREFIX = 'sync:watermark:';

async function getWatermark(table: SyncPullTable): Promise<string | null> {
  const db = getDb();
  const row = await db.meta.get(`${WATERMARK_PREFIX}${table}`);
  return (row?.value as string | undefined) ?? null;
}

async function setWatermark(table: SyncPullTable, isoTs: string) {
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
    ...toRemote({
      ...p,
      id: `${userId}-${p.templateId}-${p.liftId}-${p.order}`,
    }),
    user_id: userId,
  }));
  const { error: insertErr } = await supabase
    .from('prescriptions')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
  if (insertErr) throw insertErr;
}

/** First-time per-user seed of session templates on the server. */
export async function seedRemoteTemplatesIfEmpty(userId: string) {
  const supabase = createClient();
  const { count, error } = await supabase
    .from('templates')
    .select('id', { count: 'exact', head: true });
  if (error) {
    if (isMissingRelationError(error)) return;
    throw error;
  }
  if ((count ?? 0) > 0) return;

  const rows = TEMPLATES.map((t) => ({
    ...toRemote(t as unknown as Record<string, unknown>),
    id: remoteIdFor('templates', t.id, userId),
    user_id: userId,
  }));
  const { error: insertErr } = await supabase
    .from('templates')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
  if (insertErr) throw insertErr;
}

type RowPayload = Record<string, unknown>;

async function mirrorDelete(table: SyncPullTable, id: string) {
  const db = getDb();
  const localTable = db[TABLE_TO_LOCAL[table]];
  const localId = localIdFor(table, id);
  // @ts-expect-error dynamic table access
  await localTable.delete(localId);
}

async function persistRows(table: SyncPullTable, rows: RowPayload[]) {
  const db = getDb();
  // Strip the user-scoped id prefix before persisting so local lookups
  // continue to use the bare id (e.g. 'nutrition-2026-05-27' rather than
  // '<uuid>:nutrition-2026-05-27'). Safe to mutate — callers pass fresh
  // arrays from Supabase responses that aren't reused afterwards.
  if (USER_SCOPED_ID_TABLES.has(table as RemoteTable)) {
    for (const r of rows) {
      if (typeof r.id === 'string') {
        r.id = localIdFor(table, r.id);
      }
    }
  }
  switch (table) {
    case 'templates':
      await db.templates.bulkPut(rows.map((r) => fromRemote<SessionTemplate>(r)));
      return;
    case 'lifts':
      await db.lifts.bulkPut(rows.map((r) => fromRemote<Lift>(r)));
      return;
    case 'phase_goals':
      await db.phase_goals.bulkPut(rows.map((r) => fromRemote<PhaseGoal>(r)));
      return;
    case 'block_templates':
      await db.block_templates.bulkPut(rows.map((r) => fromRemote<BlockTemplate>(r)));
      return;
    case 'relationship_checkins':
      await db.relationship_checkins.bulkPut(rows.map((r) => fromRemote<RelationshipCheckin>(r)));
      return;
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
    case 'caffeine_logs':
      await db.caffeine_logs.bulkPut(rows.map((r) => fromRemote<CaffeineLog>(r)));
      return;
    case 'cbt_thought_records':
      await db.cbt_thought_records.bulkPut(rows.map((r) => fromRemote<CbtThoughtRecord>(r)));
      return;
    case 'stoic_checkins':
      await db.stoic_checkins.bulkPut(rows.map((r) => fromRemote<StoicCheckin>(r)));
      return;
    case 'stoic_moments':
      await db.stoic_moments.bulkPut(rows.map((r) => fromRemote<StoicMoment>(r)));
      return;
    case 'mindfulness_logs':
      await db.mindfulness_logs.bulkPut(rows.map((r) => fromRemote<MindfulnessLog>(r)));
      return;
    case 'injury_episodes':
      await db.injury_episodes.bulkPut(rows.map((r) => fromRemote<InjuryEpisode>(r)));
      return;
    case 'body_readiness_logs':
      await db.body_readiness_logs.bulkPut(rows.map((r) => fromRemote<BodyReadinessLog>(r)));
      return;
    case 'supplement_logs':
      await db.supplement_logs.bulkPut(rows.map((r) => fromRemote<SupplementLog>(r)));
      return;
    case 'oral_health_logs':
      await db.oral_health_logs.bulkPut(rows.map((r) => fromRemote<OralHealthLog>(r)));
      return;
    case 'training_checklist':
      await db.training_checklist.bulkPut(rows.map((r) => fromRemote<TrainingChecklistItem>(r)));
      return;
    case 'user_goals':
      await db.user_goals.bulkPut(rows.map((r) => fromRemote<UserGoal>(r)));
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
  const pullErrors: Array<{ table: string; error: unknown }> = [];

  for (const table of ALL_TABLES) {
    try {
      const watermark = opts.full ? null : await getWatermark(table);
      let q = supabase.from(table).select('*');
      if (watermark) q = q.gt('updated_at', watermark);
      const { data, error } = await q;

      if (error) {
        if (
          isCatalogPullTable(table) &&
          isMissingRelationError(error)
        ) {
          continue;
        }
        console.warn(`[pullAll] ${table} error:`, error.message);
        recordSyncError({
          phase: 'pull',
          table,
          message: error.message,
          code: (error as { code?: string }).code,
          status: (error as { status?: number }).status,
        });
        pullErrors.push({ table, error });
        continue;
      }

      if (opts.full && !watermark) {
        const localTable = db[TABLE_TO_LOCAL[table]];
        // @ts-expect-error dynamic table access
        await localTable.clear();
      }

      const rows = (data ?? []) as RowPayload[];
      if (rows.length > 0) {
        await persistRows(table, rows);
        let max = watermark ?? '';
        for (const r of rows) {
          const ts = (r.updated_at as string | undefined) ?? '';
          if (ts > max) max = ts;
        }
        if (max) await setWatermark(table, max);
      } else if (!watermark) {
        await setWatermark(table, new Date(0).toISOString());
      }
    } catch (err) {
      console.warn(`[pullAll] ${table} threw:`, err);
      recordSyncError({
        phase: 'pull',
        table,
        message: (err as Error)?.message ?? String(err),
      });
      pullErrors.push({ table, error: err });
    }
  }

  // pullAll resolves even with partial errors — the app
  // loads in a degraded state and syncs on next attempt.
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

  const authUserId = await getAuthUserId();
  let refreshed = false;
  const failedItems: Array<{ item: DirtyRow; err: Error }> = [];

  for (const item of dirty) {
    let attempt = 0;
    let pushed = false;
    while (!pushed) {
      attempt++;
      const err = await pushOne(item, authUserId);
      if (!err) {
        pushed = true;
        break;
      }

      const status = (err as { status?: number }).status;
      const code = (err as { code?: string }).code;
      const isAuth =
        status === 401 ||
        code === 'PGRST301' ||
        /jwt/i.test(err.message ?? '');

      if (isAuth && !refreshed && attempt === 1) {
        await supabase.auth.refreshSession();
        refreshed = true;
        continue;
      }

      // Non-auth error — log and skip this row.
      // It stays in the dirty queue and will retry on
      // the next periodic flush.
      console.warn(
        `[flushDirty] failed to push ${item.table}:${item.rowId}:`,
        err.message
      );
      failedItems.push({ item, err });
      break;
    }

    if (pushed) {
      await db.dirty.delete(item.id);
    }
  }

  if (failedItems.length > 0) {
    console.warn(
      `[flushDirty] ${failedItems.length} rows failed to push`,
      failedItems.map(f => `${f.item.table}:${f.item.rowId}`)
    );
  }
}

/** Ensures `hrv_skipped` and cleared numeric columns round-trip to Postgres on upsert. */
function readinessPushPayload(row: ReadinessLog): Record<string, unknown> {
  const base = toRemote(row) as Record<string, unknown>;
  if (row.hrvSkipped === true) {
    return {
      ...base,
      hrv_skipped: true,
      hrv_rmssd: null,
      hrv_measured_min: null,
    };
  }
  if (row.hrvSkipped === false) {
    return { ...base, hrv_skipped: false };
  }
  return base;
}

async function pushOne(item: DirtyRow, authUserId: string | null): Promise<Error | null> {
  const supabase = createClient();
  const db = getDb();
  if (item.op === 'delete') {
    const serverId = remoteIdFor(item.table, item.rowId, authUserId);
    const { error } = await supabase.from(item.table).delete().eq('id', serverId);
    if (error) {
      recordSyncError({
        phase: 'push',
        table: item.table,
        rowId: item.rowId,
        message: error.message,
        code: (error as { code?: string }).code,
        status: (error as { status?: number }).status,
      });
    }
    return error ?? null;
  }
  const localTable = db[TABLE_TO_LOCAL[item.table]];
  // @ts-expect-error dynamic table access
  const row = await localTable.get(item.rowId);
  if (!row) {
    console.warn(`[pushOne] local row not found: ${item.table}:${item.rowId} — skipping`);
    recordSyncError({
      phase: 'localMissing',
      table: item.table,
      rowId: item.rowId,
      message: 'local row not found — dirty entry orphaned',
    });
    return new Error(`local row not found: ${item.table}:${item.rowId}`);
  }
  // Strip any updatedAt we cached from the server — let Supabase set it via
  // its trigger so we don't fight the canonical value.
  const { updatedAt: _ignore, ...rest } = row as Record<string, unknown>;
  void _ignore;
  const payload = withUserIdRemote(
    item.table === 'readiness_logs'
      ? readinessPushPayload(rest as ReadinessLog)
      : (toRemote(rest) as Record<string, unknown>),
    authUserId,
  );
  if (typeof payload.id === 'string') {
    payload.id = remoteIdFor(item.table, payload.id, authUserId);
  }
  const { error } = await supabase.from(item.table).upsert(payload);
  if (error) {
    recordSyncError({
      phase: 'push',
      table: item.table,
      rowId: item.rowId,
      message: error.message,
      code: (error as { code?: string }).code,
      status: (error as { status?: number }).status,
    });
  }
  return error ?? null;
}

export type LocalWriteOpts = {
  /** Don't enqueue for push (use when the row came from a realtime payload). */
  skipDirty?: boolean;
  /** When set with a non-skipped sync delete, shows a timed Undo toast. */
  undoLabel?: string;
};

/** Drops a queued delete before it flushes — safe no-op after the delete already synced. */
export async function cancelPendingDirtyDelete(table: RemoteTable, rowId: string) {
  await getDb().dirty.delete(`${table}:${rowId}`);
}

/** Re-inserts a row cancelled by accidental delete + re-queues upsert when appropriate. */
export async function restoreDeletedRow(table: RemoteTable, snapshot: Record<string, unknown>) {
  const id = snapshot.id as string | undefined;
  if (!id) return;
  await cancelPendingDirtyDelete(table, id);
  await localUpsert(table, snapshot as { id: string });
}

export async function localUpsert<T extends { id: string }>(
  table: RemoteTable,
  row: T,
  opts: LocalWriteOpts = {},
) {
  const authUserId = await getAuthUserId();
  const rowWithUser = withUserIdLocal(row, authUserId);
  const db = getDb();
  const localTable = db[TABLE_TO_LOCAL[table]];
  // @ts-expect-error dynamic table access
  await localTable.put(rowWithUser);
  if (!opts.skipDirty) await enqueueDirty(table, rowWithUser.id, 'upsert');
}

export async function localDelete(
  table: RemoteTable,
  id: string,
  opts: LocalWriteOpts = {},
) {
  const db = getDb();
  const localTable = db[TABLE_TO_LOCAL[table]];
  // @ts-expect-error dynamic table access
  const row = await localTable.get(id);
  // @ts-expect-error dynamic table access
  await localTable.delete(id);
  if (!opts.skipDirty) await enqueueDirty(table, id, 'delete');

  const label = opts.undoLabel?.trim();
  if (label && row && !opts.skipDirty) {
    offerDeleteUndo({
      kind: 'row',
      table: table as UndoRemoteTable,
      snapshot: cloneRowForUndo(row as Record<string, unknown>),
      label,
    });
  }
}

/** Subscribe to Supabase Realtime postgres_changes for every user-scoped
 *  table and mirror them into Dexie without re-enqueuing dirty entries.
 *  Returns an unsubscribe fn. */
export function subscribeRealtime(userId: string): () => void {
  const supabase = createClient();
  const channels: RealtimeChannel[] = [];

  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      void pullAll().catch(console.error);
    }
  };
  if (typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible);
  }

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
              if (id) await mirrorDelete(table, id);
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
    if (typeof window !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisible);
    }
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
