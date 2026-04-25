'use client';

import { getDb } from './db';
import { localUpsert } from './sync';
import type { CardioLog, CardioType } from './types';

function liftToCardioType(liftId: string): CardioType {
  return liftId.includes('interval') ? 'intervals' : 'liss';
}

/**
 * One-time backfill: cardio set_logs that were saved before the LiftCard
 * mirrored them to cardio_logs are now created retroactively so the weekly
 * 150-min rollup picks them up.
 */
export async function backfillCardioFromSets() {
  const db = getDb();
  const lifts = await db.lifts.toArray();
  const cardioLiftIds = new Set(lifts.filter((l) => l.equipment === 'cardio').map((l) => l.id));
  if (cardioLiftIds.size === 0) return;

  const sets = await db.set_logs.toArray();
  const cardioSets = sets.filter((s) => cardioLiftIds.has(s.liftId) && s.status === 'completed');
  if (cardioSets.length === 0) return;

  const existing = new Set((await db.cardio_logs.toArray()).map((c) => c.id));

  for (const s of cardioSets) {
    const cardioId = `cardio-${s.sessionLogId}-${s.prescriptionId}-${s.setIndex}`;
    if (existing.has(cardioId)) continue;
    const session = await db.session_logs.get(s.sessionLogId);
    if (!session) continue;
    const row: CardioLog = {
      id: cardioId,
      sessionLogId: s.sessionLogId,
      date: session.date,
      type: liftToCardioType(s.liftId),
      durationMin: s.reps,
    };
    await localUpsert('cardio_logs', row);
  }
}
