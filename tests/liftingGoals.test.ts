import { describe, expect, it } from 'vitest';
import {
  currentBest1RmFromSets,
  currentValueForGoal,
  isGoalAchieved,
  setsForLift,
} from '@/lib/liftingGoals';
import type { SetLog, UserGoal } from '@/lib/types';

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

  it('evaluates user goal progress from set_logs', () => {
    const goal: UserGoal = {
      id: 'g1',
      userId: 'u',
      liftId: 'ohp',
      label: 'OHP 1RM',
      metric: '1rm',
      targetValue: 175,
      targetReps: null,
      deadline: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      achievedAt: null,
      baselineValue: 150,
      active: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const sets: SetLog[] = [
      {
        id: 'w',
        sessionLogId: 's',
        liftId: 'ohp',
        prescriptionId: 'p',
        setIndex: 0,
        intent: 'working',
        weight: 165,
        reps: 1,
        status: 'completed',
      },
    ];
    const current = currentValueForGoal(goal, sets);
    expect(current).toBeGreaterThanOrEqual(165);
    expect(isGoalAchieved(goal, current)).toBe(false);
    expect(isGoalAchieved({ ...goal, targetValue: 160 }, current)).toBe(true);
  });
});
