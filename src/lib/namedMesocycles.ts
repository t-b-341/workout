'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from './db';
import { localUpsert, localDelete } from './sync';
import { todayIso } from './time';
import type { NamedMesocycle } from './types';

export function useNamedMesocycles(): NamedMesocycle[] | undefined {
  return useLiveQuery(
    () => getDb().named_mesocycles.orderBy('startDate').reverse().toArray(),
    [],
  );
}

export function useActiveNamedMesocycle(): NamedMesocycle | undefined {
  const today = todayIso();
  return useLiveQuery(
    () =>
      getDb()
        .named_mesocycles
        .filter((m) => m.startDate <= today && m.endDate >= today)
        .first(),
    [],
  );
}

export async function saveNamedMesocycle(m: Omit<NamedMesocycle, 'updatedAt'>): Promise<void> {
  await localUpsert('named_mesocycles', {
    ...m,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteNamedMesocycle(id: string): Promise<void> {
  await localDelete('named_mesocycles', id, { undoLabel: 'Mesocycle' });
}

export function newMesocycleId(): string {
  return `meso-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
