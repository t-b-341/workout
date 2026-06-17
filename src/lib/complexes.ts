'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from './db';
import { localUpsert, localDelete } from './sync';
import type { Complex } from './types';

export function useComplexes(): Complex[] | undefined {
  return useLiveQuery(
    () => getDb().complexes.orderBy('updatedAt').reverse().toArray(),
    [],
  );
}

export async function saveComplex(c: Omit<Complex, 'updatedAt'>): Promise<void> {
  await localUpsert('complexes', {
    ...c,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteComplex(id: string): Promise<void> {
  await localDelete('complexes', id, { undoLabel: 'Complex' });
}

export function newComplexId(): string {
  return `complex-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Human-readable summary: "1 Clean + 2 Front Squat + 1 Jerk". */
export function complexSummary(
  elements: { liftId: string; reps: number }[],
  liftName: (id: string) => string,
): string {
  if (elements.length === 0) return 'No movements yet';
  return elements.map((e) => `${e.reps} ${liftName(e.liftId)}`).join(' + ');
}
