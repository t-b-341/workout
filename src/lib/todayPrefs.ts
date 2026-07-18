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

const DISABLED_TEMPLATES_KEY = 'today:disabledTemplates:v1';

export async function getDisabledTemplateIds(): Promise<string[]> {
  const row = await getDb().meta.get(DISABLED_TEMPLATES_KEY);
  return Array.isArray(row?.value) ? (row.value as string[]) : [];
}

export async function setDisabledTemplateIds(ids: string[]): Promise<void> {
  await getDb().meta.put({ key: DISABLED_TEMPLATES_KEY, value: ids });
}

export async function toggleTemplateDisabled(id: string): Promise<void> {
  const current = await getDisabledTemplateIds();
  const next = current.includes(id)
    ? current.filter((x) => x !== id)
    : [...current, id];
  await setDisabledTemplateIds(next);
}

export function useDisabledTemplateIds(): string[] {
  return useLiveQuery(async () => {
    const row = await getDb().meta.get(DISABLED_TEMPLATES_KEY);
    return Array.isArray(row?.value) ? (row.value as string[]) : [];
  }, []) ?? [];
}
