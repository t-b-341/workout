'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from './db';

const HIDE_PRESCRIBED_KEY = 'today:hidePrescribed:v1';

export async function getHidePrescribed(): Promise<boolean> {
  const row = await getDb().meta.get(HIDE_PRESCRIBED_KEY);
  return row?.value === true;
}

export async function setHidePrescribed(value: boolean): Promise<void> {
  await getDb().meta.put({ key: HIDE_PRESCRIBED_KEY, value });
}

export function useHidePrescribed(): boolean {
  return useLiveQuery(
    async () => (await getDb().meta.get(HIDE_PRESCRIBED_KEY))?.value === true,
    [],
  ) ?? false;
}
