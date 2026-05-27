'use client';

import { useEffect, useState } from 'react';

/**
 * Persistent ring buffer of recent sync errors.
 *
 * Push/pull failures only surface in the browser console today, which is
 * useless for users who don't have devtools open. This module persists the
 * last N errors in localStorage so they're inspectable from a UI panel.
 *
 * No Dexie schema bump — localStorage is intentional so the log survives
 * even if IndexedDB is wiped during troubleshooting.
 */

const STORAGE_KEY = 'workout:sync-errors';
const EVENT_NAME = 'workout:sync-error-recorded';
const MAX_ENTRIES = 50;

export type SyncErrorPhase = 'push' | 'pull' | 'localMissing' | 'seed';

export type SyncErrorEntry = {
  ts: number;
  phase: SyncErrorPhase;
  table?: string;
  rowId?: string;
  message: string;
  status?: number;
  code?: string;
};

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isSyncErrorEntry(v: unknown): v is SyncErrorEntry {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.ts === 'number'
    && typeof r.phase === 'string'
    && typeof r.message === 'string'
  );
}

function notify() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch {
    /* dispatchEvent unavailable in some test envs */
  }
}

export function recordSyncError(entry: Omit<SyncErrorEntry, 'ts'>): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const existing = readSyncErrors();
    const next: SyncErrorEntry[] = [{ ...entry, ts: Date.now() }, ...existing].slice(0, MAX_ENTRIES);
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
    notify();
  } catch {
    /* localStorage may be full or unavailable */
  }
}

export function readSyncErrors(): SyncErrorEntry[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSyncErrorEntry) : [];
  } catch {
    return [];
  }
}

export function clearSyncErrors(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
    notify();
  } catch {
    /* ignore */
  }
}

/** React hook that re-renders whenever the error log changes. */
export function useSyncErrors(): SyncErrorEntry[] {
  const [errors, setErrors] = useState<SyncErrorEntry[]>(() => readSyncErrors());
  useEffect(() => {
    const reload = () => setErrors(readSyncErrors());
    window.addEventListener(EVENT_NAME, reload);
    window.addEventListener('storage', reload);
    return () => {
      window.removeEventListener(EVENT_NAME, reload);
      window.removeEventListener('storage', reload);
    };
  }, []);
  return errors;
}
