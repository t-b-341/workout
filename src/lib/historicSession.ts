import { getDb } from '@/lib/db';
import { flushDirty, localUpsert } from '@/lib/sync';
import { addDaysIso, todayIso } from '@/lib/time';
import type { SessionLog, SetIntent, SetLog, TemplateId } from '@/lib/types';

export const MAY_20_DL_BACKFILL_META = 'historic_backfill:2026-05-20-l1-dl';

export type HistoricSetEntry = {
  liftId: string;
  weight: number;
  reps: number;
  intent: SetIntent;
  rpe: number | null;
};

export type SaveHistoricSessionInput = {
  date: string;
  startTime: string;
  endTime: string;
  templateId: TemplateId;
  notes?: string;
  sets: HistoricSetEntry[];
};

export function isoFromDateAndTime(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

export function durationMinFromTimes(date: string, startTime: string, endTime: string): number {
  const startMs = new Date(`${date}T${startTime}:00`).getTime();
  const endMs = new Date(`${date}T${endTime}:00`).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return Math.round((endMs - startMs) / 60_000);
}

export async function saveHistoricSession(input: SaveHistoricSessionInput): Promise<string> {
  const startedAt = isoFromDateAndTime(input.date, input.startTime);
  const completedAt = isoFromDateAndTime(input.date, input.endTime);
  const durationMin = durationMinFromTimes(input.date, input.startTime, input.endTime);
  const sessionId = `${input.date}-${input.templateId}-historic-${Date.now()}`;
  const session: SessionLog = {
    id: sessionId,
    date: input.date,
    templateId: input.templateId,
    mode: 'standard',
    deload: false,
    watchFlags: [],
    sessionType: 'standard',
    sessionStatus: 'completed',
    startedAt,
    completedAt,
    durationMin,
    notes: input.notes?.trim() || undefined,
    readinessCompletedAt: completedAt,
  };

  await localUpsert('session_logs', session);

  const db = getDb();
  const rxList = await db.prescriptions.where('templateId').equals(input.templateId).toArray();
  const rxByLift = new Map(rxList.map((p) => [p.liftId, p]));

  for (let i = 0; i < input.sets.length; i++) {
    const entry = input.sets[i]!;
    const rx = rxByLift.get(entry.liftId);
    const prescriptionId = rx?.id ?? `historic-${sessionId}-${entry.liftId}-${i}`;
    const row: SetLog = {
      id: `set-historic-${Date.now()}-${i}`,
      sessionLogId: sessionId,
      liftId: entry.liftId,
      prescriptionId,
      setIndex: i,
      intent: entry.intent,
      weight: entry.weight,
      reps: entry.reps,
      status: 'completed',
      rpe: entry.rpe ?? undefined,
      loggedAt: startedAt,
      prescribedRepMin: rx?.repMin,
      prescribedRepMax: rx?.repMax,
    };
    await localUpsert('set_logs', row);
  }

  await flushDirty().catch(() => {});
  return sessionId;
}

/** One-time backfill for the May 20, 2026 L1 deadlift max test. */
export async function ensureMay20HistoricDeadliftSession(): Promise<void> {
  const db = getDb();
  if (await db.meta.get(MAY_20_DL_BACKFILL_META)) return;

  const sessions = await db.session_logs.where('date').equals('2026-05-20').toArray();
  const l1Sessions = sessions.filter((s) => s.templateId === 'L1');
  for (const s of l1Sessions) {
    const sets = await db.set_logs.where('sessionLogId').equals(s.id).toArray();
    if (sets.some((st) => st.liftId === 'dl' && st.weight >= 425 && st.reps === 1)) {
      await db.meta.put({ key: MAY_20_DL_BACKFILL_META, value: true });
      return;
    }
  }

  await saveHistoricSession({
    date: '2026-05-20',
    startTime: '20:15',
    endTime: '20:30',
    templateId: 'L1',
    sets: [
      {
        liftId: 'dl',
        weight: 425,
        reps: 1,
        intent: 'max_test',
        rpe: 10,
      },
    ],
  });
  await db.meta.put({ key: MAY_20_DL_BACKFILL_META, value: true });
}

export function defaultHistoricDate(): string {
  return addDaysIso(todayIso(), -1);
}
