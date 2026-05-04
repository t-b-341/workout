'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/lib/db';
import type { Lift, Prescription } from '@/lib/types';

const META_KEY = 'favorite-lifts:v1';

export type FavoriteLiftsMetaV1 = { ids: string[] };

export function normalizeFavoriteLiftIds(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return [];
  const ids = (raw as FavoriteLiftsMetaV1).ids;
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0))];
}

export async function loadFavoriteLiftIds(): Promise<string[]> {
  const row = await getDb().meta.get(META_KEY);
  return normalizeFavoriteLiftIds(row?.value);
}

export async function setFavoriteLiftIds(ids: string[]): Promise<void> {
  const dedup = [...new Set(ids)];
  await getDb().meta.put({ key: META_KEY, value: { ids: dedup } satisfies FavoriteLiftsMetaV1 });
}

export async function toggleFavoriteLift(liftId: string): Promise<void> {
  const cur = await loadFavoriteLiftIds();
  const i = cur.indexOf(liftId);
  if (i >= 0) {
    await setFavoriteLiftIds(cur.filter((id) => id !== liftId));
  } else {
    await setFavoriteLiftIds([...cur, liftId]);
  }
}

/** Subscribes to Dexie meta; re-renders when favorites change. */
export function useFavoriteLiftIds(): string[] {
  const row = useLiveQuery(() => getDb().meta.where('key').equals(META_KEY).first(), []);
  return normalizeFavoriteLiftIds(row?.value);
}

/**
 * Prescriptions for the same template: pinned lifts first (in pin order), then
 * the rest in original `order`.
 */
export function sortPrescriptionsWithFavoritesFirst(
  prescriptions: Prescription[],
  favoriteIds: string[],
): Prescription[] {
  if (favoriteIds.length === 0) return prescriptions;
  const rank = new Map(favoriteIds.map((id, i) => [id, i]));
  return [...prescriptions].sort((a, b) => {
    const ar = rank.has(a.liftId) ? rank.get(a.liftId)! : Number.MAX_SAFE_INTEGER;
    const br = rank.has(b.liftId) ? rank.get(b.liftId)! : Number.MAX_SAFE_INTEGER;
    if (ar !== br) return ar - br;
    return a.order - b.order;
  });
}

/** Lift dropdown order: favorites first (pin order), then A–Z by name. */
export function sortLiftsWithFavoritesFirst(lifts: Lift[], favoriteIds: string[]): Lift[] {
  if (favoriteIds.length === 0) {
    return [...lifts].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }
  const rank = new Map(favoriteIds.map((id, i) => [id, i]));
  const fav = lifts
    .filter((l) => rank.has(l.id))
    .sort((a, b) => (rank.get(a.id)! - rank.get(b.id)!));
  const rest = lifts
    .filter((l) => !rank.has(l.id))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return [...fav, ...rest];
}
