import { describe, expect, it } from 'vitest';
import { buildTemplateSessionProgressSeries } from '@/lib/stats';
import type { Lift, SessionLog, SetLog } from '@/lib/types';

const lifts: Lift[] = [
  { id: 'bp', name: 'Bench', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5 },
];

describe('buildTemplateSessionProgressSeries', () => {
  it('chains volume deltas only within the same templateId', () => {
    const sessions: SessionLog[] = [
      {
        id: 's-l2',
        date: '2026-01-05',
        templateId: 'L2',
        mode: 'standard',
        deload: false,
        watchFlags: [],
        completedAt: '2026-01-05T12:00:00.000Z',
        startedAt: '2026-01-05T11:00:00.000Z',
      },
      {
        id: 's-u1-a',
        date: '2026-01-01',
        templateId: 'U1',
        mode: 'standard',
        deload: false,
        watchFlags: [],
        completedAt: '2026-01-01T12:00:00.000Z',
        startedAt: '2026-01-01T11:00:00.000Z',
      },
      {
        id: 's-u1-b',
        date: '2026-01-08',
        templateId: 'U1',
        mode: 'standard',
        deload: false,
        watchFlags: [],
        completedAt: '2026-01-08T12:00:00.000Z',
        startedAt: '2026-01-08T11:00:00.000Z',
      },
    ];
    const sets: SetLog[] = [
      {
        id: '1',
        sessionLogId: 's-u1-a',
        liftId: 'bp',
        prescriptionId: 'U1-bp',
        setIndex: 0,
        weight: 100,
        reps: 5,
        status: 'completed',
        loggedAt: '2026-01-01T11:30:00.000Z',
      },
      {
        id: '2',
        sessionLogId: 's-u1-b',
        liftId: 'bp',
        prescriptionId: 'U1-bp',
        setIndex: 0,
        weight: 100,
        reps: 6,
        status: 'completed',
        loggedAt: '2026-01-08T11:30:00.000Z',
      },
    ];
    const u1 = buildTemplateSessionProgressSeries('U1', sessions, sets, lifts, [], []);
    expect(u1).toHaveLength(2);
    expect(u1[0]?.strengthVolumeLb).toBe(500);
    expect(u1[0]?.volumeDeltaLb).toBeNull();
    expect(u1[1]?.strengthVolumeLb).toBe(600);
    expect(u1[1]?.volumeDeltaLb).toBe(100);
    expect(u1[1]?.deltaPct).toBeCloseTo(20, 5);
  });
});
