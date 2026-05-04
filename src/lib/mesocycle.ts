'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from './db';
import { addDaysIso } from './time';
import { startOfWeekIso, isoWeekOf } from './stats';

/** A mesocycle = N accumulation weeks + M deload weeks, anchored at a
 *  Monday. We persist this in Dexie's `meta` table (local-only — does not
 *  sync to Supabase yet; one config per device, re-enter on new device).
 *
 *  **Block boundaries:** Use `anchorMonday`, `blockStartMondayForMesoIndex`, and
 *  `blockDateRangeForMesoIndex` when stats must align to Meso K’s calendar
 *  window (Monday of week 1 → Sunday of week `accumulation + deload`).
 *
 *  **Rolling window:** The Program tab’s length recommendation uses the last
 *  `(accumulation + deload) × 7` *calendar days* ending today — see
 *  `analyzeMesoLengthRecommendation` in `mesoRecommendation.ts` — which is *not*
 *  guaranteed to match a single mesocycle block. */
export type MesocycleConfig = {
  /** ISO date (yyyy-mm-dd) of the Monday of Meso 1 · Week 1. */
  startDate: string;
  /** Accumulation weeks per mesocycle (e.g. 4). */
  accumulation: number;
  /** Deload weeks per mesocycle (typically 1). */
  deload: number;
};

const META_KEY = 'mesocycle:config';

/** Dexie `meta` key — remembers which new-meso Monday we already prompted for (Step 4 UI). */
const BOUNDARY_PROMPT_META_KEY = 'mesocycle:lastBoundaryPrompt:v1';

export type MesoBoundaryPromptState = {
  /** First Monday of the current meso block; user dismissed or applied for this boundary. */
  dismissedForNewMesoStartMonday: string;
};

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

export async function loadMesoBoundaryPromptState(): Promise<MesoBoundaryPromptState | null> {
  const row = await getDb().meta.get(BOUNDARY_PROMPT_META_KEY);
  const v = row?.value as Partial<MesoBoundaryPromptState> | undefined;
  if (!v || typeof v.dismissedForNewMesoStartMonday !== 'string') return null;
  return { dismissedForNewMesoStartMonday: v.dismissedForNewMesoStartMonday };
}

/** Call after user dismisses or applies the “next meso” length suggestion for this boundary. */
export async function saveMesoBoundaryPromptDismissed(newMesoStartMonday: string) {
  await getDb().meta.put({
    key: BOUNDARY_PROMPT_META_KEY,
    value: { dismissedForNewMesoStartMonday: newMesoStartMonday },
  });
}

export async function clearMesoBoundaryPromptState() {
  await getDb().meta.delete(BOUNDARY_PROMPT_META_KEY);
}

/** Reactive read of boundary-prompt dedupe state (`undefined` while loading). */
export function useMesoBoundaryPromptState(): MesoBoundaryPromptState | null | undefined {
  return useLiveQuery(() => loadMesoBoundaryPromptState(), []);
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

/** Monday of Meso 1 · Week 1 (normalized from `cfg.startDate`). */
export function anchorMonday(cfg: MesocycleConfig): string {
  return startOfWeekIso(isoWeekOf(cfg.startDate));
}

/** Monday starting meso block `mesoIndex` (1-based). */
export function blockStartMondayForMesoIndex(cfg: MesocycleConfig, mesoIndex: number): string | null {
  const totalWeeks = cfg.accumulation + cfg.deload;
  if (totalWeeks <= 0 || mesoIndex < 1 || !Number.isFinite(mesoIndex)) return null;
  const anchor = anchorMonday(cfg);
  const offsetWeeks = (mesoIndex - 1) * totalWeeks;
  return addDaysIso(anchor, offsetWeeks * 7);
}

/** Inclusive calendar range covering all weeks of meso `mesoIndex`. */
export function blockDateRangeForMesoIndex(
  cfg: MesocycleConfig,
  mesoIndex: number,
): { fromIso: string; toIso: string } | null {
  const totalWeeks = cfg.accumulation + cfg.deload;
  const fromIso = blockStartMondayForMesoIndex(cfg, mesoIndex);
  if (!fromIso || totalWeeks <= 0) return null;
  const toIso = addDaysIso(fromIso, totalWeeks * 7 - 1);
  return { fromIso, toIso };
}

/** Whole ISO weeks from anchor Monday to `dateIso`’s week Monday; null if before anchor. */
export function weeksSinceAnchorMonday(dateIso: string, cfg: MesocycleConfig): number | null {
  const totalWeeks = cfg.accumulation + cfg.deload;
  if (totalWeeks <= 0) return null;
  const targetMonday = startOfWeekIso(isoWeekOf(dateIso));
  const startMonday = anchorMonday(cfg);
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksSinceStart = Math.round(
    (Date.parse(targetMonday + 'T00:00:00') - Date.parse(startMonday + 'T00:00:00')) / msPerWeek,
  );
  if (weeksSinceStart < 0) return null;
  return weeksSinceStart;
}

/** Returns null for dates that fall before the mesocycle start anchor. */
export function mesocyclePosition(dateIso: string, cfg: MesocycleConfig): MesocyclePosition | null {
  const totalWeeks = cfg.accumulation + cfg.deload;
  if (totalWeeks <= 0) return null;

  const weeksSinceStart = weeksSinceAnchorMonday(dateIso, cfg);
  if (weeksSinceStart === null) return null;

  const mesoIndex = Math.floor(weeksSinceStart / totalWeeks) + 1;
  const weekInMeso = (weeksSinceStart % totalWeeks) + 1;
  const isDeload = weekInMeso > cfg.accumulation;
  return { mesoIndex, weekInMeso, totalWeeks, isDeload };
}
