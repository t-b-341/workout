import { describe, expect, it } from 'vitest';
import { buildCompletedMesoBlockReport, buildMesoWeekStats } from '@/lib/mesoBlockInsights';
import type { MesocycleConfig } from '@/lib/mesocycle';
import type { Lift, ReadinessLog, SessionLog, SetLog } from '@/lib/types';

const lifts: Lift[] = [
  {
    id: 'bp',
    name: 'Bench',
    equipment: 'barbell',
    loadUnit: 'lb',
    repUnit: 'reps',
    increment: 5,
    muscleGroups: ['chest'],
    pattern: 'horiz-push',
  },
];

describe('mesoBlockInsights', () => {
  const cfg: MesocycleConfig = {
    startDate: '2026-01-05',
    accumulation: 3,
    deload: 1,
  };

  it('buildMesoWeekStats returns one row per block week', () => {
    const sessions: SessionLog[] = [
      {
        id: '2026-01-05-U1',
        date: '2026-01-05',
        templateId: 'U1',
        mode: 'standard',
        deload: false,
        watchFlags: [],
        completedAt: '2026-01-05T12:00:00.000Z',
      },
    ];
    const sets: SetLog[] = [
      {
        id: 's1',
        sessionLogId: '2026-01-05-U1',
        liftId: 'bp',
        setIndex: 0,
        reps: 5,
        weight: 185,
        status: 'completed',
      },
    ];
    const readiness: ReadinessLog[] = [
      {
        id: 'r1',
        sessionLogId: '2026-01-05-U1',
        date: '2026-01-05',
        sleepHours: 8,
        soreness: 2,
        motivation: 4,
        createdAt: '2026-01-05T08:00:00.000Z',
      },
    ];

    const weeks = buildMesoWeekStats(cfg, 1, sessions, sets, readiness, lifts, '2026-01-20');
    expect(weeks).not.toBeNull();
    expect(weeks!.length).toBe(4);
    expect(weeks![0].label).toBe('Accum W1');
    expect(weeks![3].isDeload).toBe(true);
    expect(weeks![0].sessionDays).toBe(1);
  });

  it('buildCompletedMesoBlockReport includes narrative fields', () => {
    const sessions: SessionLog[] = [
      {
        id: '2026-01-05-U1',
        date: '2026-01-05',
        templateId: 'U1',
        mode: 'standard',
        deload: false,
        watchFlags: [],
        completedAt: '2026-01-05T12:00:00.000Z',
      },
    ];
    const sets: SetLog[] = [
      {
        id: 's1',
        sessionLogId: '2026-01-05-U1',
        liftId: 'bp',
        setIndex: 0,
        reps: 5,
        weight: 185,
        status: 'completed',
      },
    ];
    const readiness: ReadinessLog[] = [
      {
        id: 'r1',
        sessionLogId: '2026-01-05-U1',
        date: '2026-01-05',
        sleepHours: 8,
        soreness: 2,
        motivation: 4,
        createdAt: '2026-01-05T08:00:00.000Z',
      },
    ];

    const report = buildCompletedMesoBlockReport(
      cfg,
      1,
      sessions,
      sets,
      readiness,
      lifts,
      '2026-02-15',
    );
    expect(report).not.toBeNull();
    expect(report!.trendSummary.length).toBeGreaterThan(10);
    expect(report!.strategyBullets.length).toBeGreaterThan(0);
    expect(report!.lengthRecommendation.action).toMatch(/extend|shorten|keep/);
  });
});
