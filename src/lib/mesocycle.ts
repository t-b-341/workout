'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from './db';
import { startOfWeekIso, isoWeekOf } from './stats';

/** A mesocycle = N accumulation weeks + M deload weeks, anchored at a
 *  Monday. We persist this in Dexie's `meta` table (local-only — does not
 *  sync to Supabase yet; one config per device, re-enter on new device). */
export type MesocycleConfig = {
  /** ISO date (yyyy-mm-dd) of the Monday of Meso 1 · Week 1. */
  startDate: string;
  /** Accumulation weeks per mesocycle (e.g. 4). */
  accumulation: number;
  /** Deload weeks per mesocycle (typically 1). */
  deload: number;
};

const META_KEY = 'mesocycle:config';

export function defaultMesoConfig(today: string = new Date().toISOString().slice(0, 10)): MesocycleConfig {
  return {
    startDate: startOfWeekIso(isoWeekOf(today)),
    accumulation: 4,
    deload: 1,
  };
}

export async function loadMesoConfig(): Promise<MesocycleConfig> {
  const row = await getDb().meta.get(META_KEY);
  const v = row?.value as Partial<MesocycleConfig> | undefined;
  if (!v || !v.startDate) return defaultMesoConfig();
  return {
    startDate: v.startDate,
    accumulation: Math.max(1, v.accumulation ?? 4),
    deload: Math.max(0, v.deload ?? 1),
  };
}

export async function saveMesoConfig(cfg: MesocycleConfig) {
  await getDb().meta.put({ key: META_KEY, value: cfg });
}

/** Reactive live read of the mesocycle config. Returns `undefined` while
 *  loading, then the stored config (or defaults if nothing's saved). */
export function useMesoConfig(): MesocycleConfig | undefined {
  return useLiveQuery(() => loadMesoConfig(), []);
}

export type MesocyclePosition = {
  mesoIndex: number;     // 1-based
  weekInMeso: number;    // 1-based
  totalWeeks: number;    // accumulation + deload
  isDeload: boolean;
};

/** Returns null for dates that fall before the mesocycle start anchor. */
export function mesocyclePosition(dateIso: string, cfg: MesocycleConfig): MesocyclePosition | null {
  const totalWeeks = cfg.accumulation + cfg.deload;
  if (totalWeeks <= 0) return null;

  // Snap both dates to the Monday of their ISO week before subtracting,
  // so we count whole weeks regardless of which weekday the input is.
  const targetMonday = startOfWeekIso(isoWeekOf(dateIso));
  const startMonday = startOfWeekIso(isoWeekOf(cfg.startDate));

  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksSinceStart = Math.round(
    (Date.parse(targetMonday + 'T00:00:00') - Date.parse(startMonday + 'T00:00:00')) / msPerWeek,
  );
  if (weeksSinceStart < 0) return null;

  const mesoIndex = Math.floor(weeksSinceStart / totalWeeks) + 1;
  const weekInMeso = (weeksSinceStart % totalWeeks) + 1;
  const isDeload = weekInMeso > cfg.accumulation;
  return { mesoIndex, weekInMeso, totalWeeks, isDeload };
}
