import { describe, expect, it } from 'vitest';
import { buildLiftingGoalSnapshots } from '@/lib/exportLocalDump';
import { currentBest1RmFromSets, setsForLift } from '@/lib/liftingGoals';
import type { SetLog } from '@/lib/types';

describe('liftingGoals', () => {
  it('counts quick session sets with synthetic prescriptionId by liftId only', () => {
    const set_logs: SetLog[] = [
      {
        id: 'q-ohp',
        sessionLogId: '2026-05-16-QUICK-1',
        liftId: 'ohp',
        prescriptionId: 'quick-ohp',
        setIndex: 0,
        intent: 'max_test',
        weight: 165,
        reps: 1,
        status: 'completed',
      },
      {
        id: 'q-pp',
        sessionLogId: '2026-05-16-QUICK-1',
        liftId: 'pp',
        prescriptionId: 'quick-pp',
        setIndex: 0,
        intent: 'working',
        weight: 185,
        reps: 1,
        status: 'completed',
      },
    ];

    expect(currentBest1RmFromSets(setsForLift(set_logs, 'ohp'))).toBe(165);
    expect(currentBest1RmFromSets(setsForLift(set_logs, 'pp'))).toBeGreaterThanOrEqual(185);

    const snaps = buildLiftingGoalSnapshots(set_logs);
    expect(snaps.find((s) => s.goalId === 'ohp_1rm')?.currentValue).toBe(165);
    expect(snaps.find((s) => s.goalId === 'pp_1rm')?.currentValue).toBeGreaterThanOrEqual(185);
  });

  it('ignores warmup and non-completed sets', () => {
    const set_logs: SetLog[] = [
      {
        id: 'warm',
        sessionLogId: 's1',
        liftId: 'ohp',
        prescriptionId: 'quick-ohp',
        setIndex: 0,
        intent: 'warmup',
        weight: 95,
        reps: 5,
        status: 'completed',
      },
      {
        id: 'skip',
        sessionLogId: 's1',
        liftId: 'ohp',
        prescriptionId: 'quick-ohp',
        setIndex: 1,
        intent: 'working',
        weight: 165,
        reps: 1,
        status: 'skipped',
      },
    ];
    expect(currentBest1RmFromSets(set_logs)).toBe(0);
  });
});
