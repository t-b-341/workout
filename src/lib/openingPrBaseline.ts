import { getDb } from '@/lib/db';
import { flushDirty, localUpsert } from '@/lib/sync';
import { todayIso } from '@/lib/time';
import type { SessionLog, SetLog } from '@/lib/types';

/** Local flag: opening baseline session + sets were written once (v2 = dated with import-day calendar). */
export const OPENING_PR_BASELINE_META_KEY = 'opening-pr-baseline-v2';

const SESSION_ID = 'session-opening-pr-baseline';

/**
 * One completed session holding best-ever sets for key lifts (Barbell Row, Bench,
 * OHP, Push Press, unassisted pull-ups, Back Squat, Deadlift). Idempotent.
 *
 * @returns whether this invocation actually wrote rows (`true`) or was already done (`false`).
 */
export async function applyOpeningPrBaseline(): Promise<boolean> {
  const db = getDb();
  const flag = await db.meta.get(OPENING_PR_BASELINE_META_KEY);
  if (flag?.value) return false;

  const date = todayIso();
  const noon = Date.parse(`${date}T12:00:00`);
  const t0 = Number.isFinite(noon) ? noon : Date.now();

  const session: SessionLog = {
    id: SESSION_ID,
    date,
    templateId: 'L1',
    mode: 'standard',
    deload: false,
    watchFlags: [],
    completedAt: new Date(t0 + 55 * 60_000).toISOString(),
    readinessCompletedAt: new Date(t0 + 54 * 60_000).toISOString(),
  };

  const sets: SetLog[] = [
    {
      id: 'opening-set-bbr',
      sessionLogId: SESSION_ID,
      liftId: 'bbr',
      prescriptionId: 'U3-bbr',
      setIndex: 0,
      weight: 200,
      reps: 5,
      status: 'completed',
      loggedAt: new Date(t0 + 1 * 1000).toISOString(),
    },
    {
      id: 'opening-set-bp',
      sessionLogId: SESSION_ID,
      liftId: 'bp',
      prescriptionId: 'U1-bp',
      setIndex: 0,
      weight: 235,
      reps: 1,
      status: 'completed',
      loggedAt: new Date(t0 + 2 * 1000).toISOString(),
    },
    {
      id: 'opening-set-ohp',
      sessionLogId: SESSION_ID,
      liftId: 'ohp',
      prescriptionId: 'U1-ohp',
      setIndex: 0,
      weight: 145,
      reps: 1,
      status: 'completed',
      loggedAt: new Date(t0 + 3 * 1000).toISOString(),
    },
    {
      id: 'opening-set-pp',
      sessionLogId: SESSION_ID,
      liftId: 'pp',
      prescriptionId: 'U1-pp',
      setIndex: 0,
      weight: 175,
      reps: 1,
      status: 'completed',
      loggedAt: new Date(t0 + 4 * 1000).toISOString(),
    },
    {
      id: 'opening-set-p1bw',
      sessionLogId: SESSION_ID,
      liftId: 'p1_bw',
      prescriptionId: 'U3-p1_bw',
      setIndex: 0,
      weight: 0,
      reps: 3,
      status: 'completed',
      loggedAt: new Date(t0 + 5 * 1000).toISOString(),
    },
    {
      id: 'opening-set-sq',
      sessionLogId: SESSION_ID,
      liftId: 'back_squat',
      prescriptionId: 'L1-back_squat',
      setIndex: 0,
      weight: 335,
      reps: 1,
      status: 'completed',
      loggedAt: new Date(t0 + 6 * 1000).toISOString(),
    },
    {
      id: 'opening-set-dl',
      sessionLogId: SESSION_ID,
      liftId: 'dl',
      prescriptionId: 'L1-dl',
      setIndex: 0,
      weight: 435,
      reps: 1,
      status: 'completed',
      loggedAt: new Date(t0 + 7 * 1000).toISOString(),
    },
  ];

  await localUpsert('session_logs', session);
  for (const row of sets) {
    await localUpsert('set_logs', row);
  }
  await db.meta.put({ key: OPENING_PR_BASELINE_META_KEY, value: true });
  await flushDirty().catch(() => {});
  return true;
}
