'use client';

import { getDb } from './db';

/** Meta keys `workout:dayNotes:v1:YYYY-MM-DD` — one free-text note per local calendar day. */
export const DAY_NOTES_META_PREFIX = 'workout:dayNotes:v1:' as const;

const DAY_NOTES_MAX_CHARS = 2000;

export type DayNotesPayload = {
  text: string;
  updatedAt: string;
};

export function dayNotesMetaKey(date: string): string {
  return `${DAY_NOTES_META_PREFIX}${date}`;
}

export function normalizeDayNotesValue(v: unknown): DayNotesPayload {
  if (!v || typeof v !== 'object') return { text: '', updatedAt: '' };
  const o = v as Partial<DayNotesPayload>;
  const text = typeof o.text === 'string' ? o.text.slice(0, DAY_NOTES_MAX_CHARS) : '';
  const updatedAt = typeof o.updatedAt === 'string' ? o.updatedAt : '';
  return { text, updatedAt };
}

/** Persist trimmed note; deletes meta row when empty. */
export async function saveDayNotes(date: string, rawText: string): Promise<void> {
  const text = rawText.replace(/\r\n/g, '\n').trimEnd().slice(0, DAY_NOTES_MAX_CHARS);
  const key = dayNotesMetaKey(date);
  if (text.length === 0) {
    await getDb().meta.delete(key);
    return;
  }
  await getDb().meta.put({
    key,
    value: { text, updatedAt: new Date().toISOString() } satisfies DayNotesPayload,
  });
}
