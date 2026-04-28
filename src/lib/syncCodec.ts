/**
 * Pure Supabase ↔ local row encoding (no I/O). Shared by `sync.ts` and tests.
 */

const camelToSnake = (s: string) => s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
const snakeToCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

export function toRemote<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[camelToSnake(k)] = v;
  return out;
}

export function fromRemote<T>(row: Record<string, unknown>): T {
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
  return out as T;
}
