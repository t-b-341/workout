'use client';

const STORAGE_KEY = 'workout:sundayMondayEarlyUnlock:v1';

function parseStore(raw: string | null): Record<string, boolean> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object') return {};
    const out: Record<string, boolean> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val === true) out[k] = true;
    }
    return out;
  } catch {
    return {};
  }
}

/** User explicitly opened Monday's lifts on this calendar Sunday (early start). */
export function readSundayMondayEarlyUnlocked(sundayDateIso: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return parseStore(window.localStorage.getItem(STORAGE_KEY))[sundayDateIso] === true;
  } catch {
    return false;
  }
}

export function writeSundayMondayEarlyUnlocked(sundayDateIso: string): void {
  if (typeof window === 'undefined') return;
  try {
    const cur = parseStore(window.localStorage.getItem(STORAGE_KEY));
    cur[sundayDateIso] = true;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cur));
  } catch {
    /* ignore */
  }
}
