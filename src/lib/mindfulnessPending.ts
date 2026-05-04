'use client';

import { getDb } from './db';
import { localUpsert } from './sync';

export const MINDFULNESS_MINUTES_MAX = 180;

/** Meta keys `mindfulness:pending:${sessionId}` for pre-check-in snapshots. */
export const MINDFULNESS_PENDING_META_PREFIX = 'mindfulness:pending:' as const;

const SESSION_ID_FOR_MINDFULNESS_RE = /^(\d{4}-\d{2}-\d{2})-([UL][123])$/;

/** Parses `YYYY-MM-DD` from session ids like `2026-05-02-U1`. */
export function sessionDateFromMindfulnessSessionId(sessionId: string): string | undefined {
  return SESSION_ID_FOR_MINDFULNESS_RE.exec(sessionId)?.[1];
}

export function clampMindfulnessMinutes(n: number): number {
  return Math.min(MINDFULNESS_MINUTES_MAX, Math.max(0, Math.round(n)));
}

export function mindfulnessPendingMetaKey(sessionId: string): string {
  return `${MINDFULNESS_PENDING_META_PREFIX}${sessionId}`;
}

/** Read, delete, and return pending minutes from a pre-check-in snapshot (if any). */
export async function takePendingMindfulnessMinutes(sessionId: string): Promise<number | undefined> {
  const key = mindfulnessPendingMetaKey(sessionId);
  const row = await getDb().meta.get(key);
  await getDb().meta.delete(key);
  if (!row?.value || typeof row.value !== 'object') return undefined;
  const m = (row.value as { minutes?: unknown }).minutes;
  if (typeof m !== 'number' || !Number.isFinite(m)) return undefined;
  return clampMindfulnessMinutes(m);
}

/** Updates mindfulness minutes without dropping other readiness fields (e.g. `hrvSkipped`). */
export async function saveReadinessMindfulnessMinutes(readinessId: string, minutes: number): Promise<void> {
  const v = clampMindfulnessMinutes(minutes);
  const cur = await getDb().readiness_logs.get(readinessId);
  if (!cur) return;
  await localUpsert('readiness_logs', { ...cur, mindfulnessMinutes: v });
}
