'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from './db';

export const SUPPLEMENTS_META_PREFIX = 'workout:supplements:v1:' as const;

export const SUPPLEMENT_ITEMS = [
  { id: 'zma', label: 'ZMA' },
  { id: 'd3k2', label: 'D3 + K2' },
  { id: 'multi', label: 'Multivitamin' },
  { id: 'creatine', label: 'Creatine' },
] as const;

export type SupplementId = (typeof SUPPLEMENT_ITEMS)[number]['id'];

export type SupplementPayload = {
  taken: Record<string, boolean>;
  updatedAt: string;
};

export function supplementsMetaKey(date: string): string {
  return `${SUPPLEMENTS_META_PREFIX}${date}`;
}

export function normalizeSupplementsValue(v: unknown): SupplementPayload {
  if (!v || typeof v !== 'object') {
    return { taken: {}, updatedAt: '' };
  }
  const o = v as Partial<SupplementPayload>;
  const takenRaw = o.taken;
  const taken: Record<string, boolean> = {};
  if (takenRaw && typeof takenRaw === 'object') {
    for (const { id } of SUPPLEMENT_ITEMS) {
      taken[id] = Boolean((takenRaw as Record<string, unknown>)[id]);
    }
  }
  const updatedAt = typeof o.updatedAt === 'string' ? o.updatedAt : '';
  return { taken, updatedAt };
}

export async function saveSupplements(date: string, payload: Omit<SupplementPayload, 'updatedAt'>): Promise<void> {
  const key = supplementsMetaKey(date);
  const hasAny = SUPPLEMENT_ITEMS.some(({ id }) => payload.taken[id]);
  if (!hasAny) {
    await getDb().meta.delete(key);
    return;
  }
  await getDb().meta.put({
    key,
    value: {
      taken: { ...payload.taken },
      updatedAt: new Date().toISOString(),
    } satisfies SupplementPayload,
  });
}

export function useSupplementsForDate(date: string) {
  const metaKey = supplementsMetaKey(date);
  return useLiveQuery(() => getDb().meta.where('key').equals(metaKey).first(), [metaKey]);
}

export type SupplementLogExport = {
  date: string;
  zma: boolean;
  d3k2: boolean;
  multi: boolean;
  creatine: boolean;
  allTaken: boolean;
  updatedAt: string;
};

export function buildSupplementLogsExport(
  meta: Array<{ key: string; value: unknown }>,
): SupplementLogExport[] {
  const out: SupplementLogExport[] = [];
  for (const row of meta) {
    if (!row.key.startsWith(SUPPLEMENTS_META_PREFIX)) continue;
    const date = row.key.slice(SUPPLEMENTS_META_PREFIX.length);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const payload = normalizeSupplementsValue(row.value);
    const zma = Boolean(payload.taken.zma);
    const d3k2 = Boolean(payload.taken.d3k2);
    const multi = Boolean(payload.taken.multi);
    const creatine = Boolean(payload.taken.creatine);
    if (!zma && !d3k2 && !multi && !creatine) continue;
    out.push({
      date,
      zma,
      d3k2,
      multi,
      creatine,
      allTaken: zma && d3k2 && multi && creatine,
      updatedAt: payload.updatedAt || new Date(0).toISOString(),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
