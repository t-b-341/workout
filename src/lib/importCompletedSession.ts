import { getDb } from '@/lib/db';
import { decideProgression } from '@/lib/progression';
import { defaultTemplateForLocalDate } from '@/lib/seed';
import { finalizeWorkoutPauseAtCompletion, sessionDurationMs } from '@/lib/stats';
import { ensureLocalSeed, flushDirty, localUpsert } from '@/lib/sync';
import { todayIso } from '@/lib/time';
import type { Prescription, SessionLog, SetLog, TemplateId } from '@/lib/types';

export type ImportLiftSet = {
  liftId: string;
  weight: number;
  /** Defaults to prescription `sets`. */
  sets?: number;
  /** Defaults to midpoint of prescription rep range. */
  reps?: number;
};

export type ImportCompletedSessionInput = {
  date?: string;
  templateId?: TemplateId;
  durationMin: number;
  lifts: ImportLiftSet[];
  notes?: string;
  /** When true (default), applies finish-session progression for logged lifts. */
  runProgression?: boolean;
};

/** 30 min upper session: push press 185, OHP 165 (today / Friday U3). */
export const PP_OHP_WORKOUT_MAY_15: ImportCompletedSessionInput = {
  durationMin: 30,
  lifts: [
    { liftId: 'pp', weight: 185 },
    { liftId: 'ohp', weight: 165 },
  ],
};

function defaultReps(rx: Prescription): number {
  return Math.round((rx.repMin + rx.repMax) / 2);
}

/**
 * Writes a completed session + working sets locally (and syncs when online).
 * Idempotent per session id: re-import updates the same session row and upserts sets.
 */
export async function importCompletedSession(
  input: ImportCompletedSessionInput,
): Promise<{ sessionId: string; durationMs: number | null }> {
  await ensureLocalSeed();
  const db = getDb();
  const date = input.date ?? todayIso();
  const templates = await db.templates.toArray();
  const templateId = input.templateId ?? defaultTemplateForLocalDate(templates).id;
  const sessionId = `${date}-${templateId}`;

  const rxList = await db.prescriptions.where('templateId').equals(templateId).toArray();
  const rxByLift = new Map(rxList.map((p) => [p.liftId, p]));

  const t0 = Date.parse(`${date}T12:00:00`);
  const startMs = Number.isFinite(t0) ? t0 : Date.now();
  const endMs = startMs + input.durationMin * 60_000;
  const startedAt = new Date(startMs).toISOString();
  const completedAt = new Date(endMs).toISOString();

  const existing = await db.session_logs.get(sessionId);
  const session: SessionLog = {
    id: sessionId,
    date,
    templateId,
    mode: 'standard',
    deload: false,
    watchFlags: [],
    sessionType: 'standard',
    startedAt,
    completedAt,
    notes: input.notes?.trim() || existing?.notes,
    readinessCompletedAt: existing?.readinessCompletedAt ?? startedAt,
  };

  const sets: SetLog[] = [];
  let liftOffsetSec = 0;
  for (const lift of input.lifts) {
    const rx = rxByLift.get(lift.liftId);
    if (!rx) {
      throw new Error(`No prescription for lift "${lift.liftId}" on template ${templateId}`);
    }
    const setCount = lift.sets ?? rx.sets;
    const reps = lift.reps ?? defaultReps(rx);
    for (let setIndex = 0; setIndex < setCount; setIndex++) {
      liftOffsetSec += 1;
      const loggedAt = new Date(startMs + liftOffsetSec * 1000).toISOString();
      sets.push({
        id: `${sessionId}-${rx.id}-${setIndex}-X`,
        sessionLogId: sessionId,
        liftId: lift.liftId,
        prescriptionId: rx.id,
        setIndex,
        intent: 'working',
        weight: lift.weight,
        reps,
        status: 'completed',
        loggedAt,
      });
    }
  }

  await localUpsert('session_logs', session);
  for (const row of sets) {
    await localUpsert('set_logs', row);
  }

  if (input.runProgression !== false) {
    const lifts = await db.lifts.toArray();
    const liftById = new Map(lifts.map((l) => [l.id, l]));
    const sessionSets = await db.set_logs.where('sessionLogId').equals(sessionId).toArray();
    for (const p of rxList) {
      const dec = decideProgression(p, sessionSets, session, undefined, liftById);
      if (dec.advanced) {
        await localUpsert('prescriptions', { ...p, weight: dec.nextWeight });
      }
    }
    const finalSession = {
      ...finalizeWorkoutPauseAtCompletion(session, completedAt),
      completedAt,
    };
    await localUpsert('session_logs', finalSession);
  }

  await flushDirty().catch(() => {});

  const allSets = await db.set_logs.where('sessionLogId').equals(sessionId).toArray();
  const durationMs = sessionDurationMs(session, allSets);
  return { sessionId, durationMs };
}
