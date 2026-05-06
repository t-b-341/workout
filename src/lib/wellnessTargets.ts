'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from './db';
import { WELLNESS_GOAL_MINDFULNESS_MAX } from './mindfulnessPending';
import { CARDIO_WEEKLY_TARGET_MIN } from './seed';

const META_KEY = 'wellness:targets:v1';

export type WellnessTargets = {
  mindfulnessDailyMin: number;
  mindfulnessWeeklyMin: number;
  cardioWeeklyMin: number;
};

export function defaultWellnessTargets(): WellnessTargets {
  return {
    mindfulnessDailyMin: 10,
    mindfulnessWeeklyMin: 70,
    cardioWeeklyMin: CARDIO_WEEKLY_TARGET_MIN,
  };
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function normalizeWellnessTargets(raw: unknown): WellnessTargets {
  const d = defaultWellnessTargets();
  if (!raw || typeof raw !== 'object') return d;
  const v = raw as Partial<WellnessTargets>;
  const n = (x: unknown, fallback: number) =>
    typeof x === 'number' && Number.isFinite(x) ? x : fallback;
  return {
    mindfulnessDailyMin: clampInt(n(v.mindfulnessDailyMin, d.mindfulnessDailyMin), 1, WELLNESS_GOAL_MINDFULNESS_MAX),
    mindfulnessWeeklyMin: clampInt(
      n(v.mindfulnessWeeklyMin, d.mindfulnessWeeklyMin),
      1,
      WELLNESS_GOAL_MINDFULNESS_MAX * 7,
    ),
    cardioWeeklyMin: clampInt(n(v.cardioWeeklyMin, d.cardioWeeklyMin), 1, 3000),
  };
}

export async function loadWellnessTargets(): Promise<WellnessTargets> {
  const row = await getDb().meta.get(META_KEY);
  return normalizeWellnessTargets(row?.value);
}

export async function saveWellnessTargets(targets: WellnessTargets) {
  const next = normalizeWellnessTargets(targets);
  await getDb().meta.put({ key: META_KEY, value: next });
}

export function useWellnessTargets(): WellnessTargets | undefined {
  return useLiveQuery(async () => normalizeWellnessTargets((await getDb().meta.get(META_KEY))?.value), []);
}
