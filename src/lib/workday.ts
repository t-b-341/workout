'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from './db';

export const WORKDAY_META_PREFIX = 'workout:workday:v1:' as const;

export type WorkdayShift = 'am' | 'pm' | 'double' | 'off' | 'sunday';

export type WorkdayPayload = {
  shift: WorkdayShift | null;
  updatedAt: string;
};

export function workdayMetaKey(date: string): string {
  return `${WORKDAY_META_PREFIX}${date}`;
}

export function normalizeWorkdayValue(v: unknown): WorkdayPayload {
  if (!v || typeof v !== 'object') return { shift: null, updatedAt: '' };
  const o = v as Partial<WorkdayPayload>;
  const raw = o.shift;
  const shift =
    raw === 'am' || raw === 'pm' || raw === 'double' || raw === 'off' || raw === 'sunday'
      ? raw
      : null;
  const updatedAt = typeof o.updatedAt === 'string' ? o.updatedAt : '';
  return { shift, updatedAt };
}

export function durationHrForShift(shift: WorkdayShift): number {
  switch (shift) {
    case 'am':
    case 'pm':
      return 6.5;
    case 'double':
      return 10.5;
    case 'sunday':
      return 8.5;
    case 'off':
      return 0;
    default:
      return 0;
  }
}

/** Persist selection; deletes meta row when shift is null. */
export async function saveWorkday(date: string, shift: WorkdayShift | null): Promise<void> {
  const key = workdayMetaKey(date);
  if (shift == null) {
    await getDb().meta.delete(key);
    return;
  }
  await getDb().meta.put({
    key,
    value: { shift, updatedAt: new Date().toISOString() } satisfies WorkdayPayload,
  });
}

export function useWorkdayForDate(date: string) {
  const metaKey = workdayMetaKey(date);
  return useLiveQuery(() => getDb().meta.where('key').equals(metaKey).first(), [metaKey]);
}

export type WorkdayLogExport = {
  date: string;
  shift: WorkdayShift;
  durationHr: number;
  updatedAt: string;
};

/** One row per calendar day with a non-null workday shift (Dexie meta). */
export function buildWorkdayLogsExport(
  meta: Array<{ key: string; value: unknown }>,
): WorkdayLogExport[] {
  const out: WorkdayLogExport[] = [];
  for (const row of meta) {
    if (!row.key.startsWith(WORKDAY_META_PREFIX)) continue;
    const date = row.key.slice(WORKDAY_META_PREFIX.length);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const payload = normalizeWorkdayValue(row.value);
    if (payload.shift == null) continue;
    out.push({
      date,
      shift: payload.shift,
      durationHr: durationHrForShift(payload.shift),
      updatedAt: payload.updatedAt || new Date(0).toISOString(),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
