import { describe, expect, it } from 'vitest';
import {
  buildCompletedMesoBlockReport,
  buildMesoWeekStats,
  formatAccumulationTrendLines,
  type MesoWeekStat,
} from '@/lib/mesoBlockInsights';
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
        prescriptionId: 'rx1',
        setIndex: 0,
        reps: 5,
        weight: 185,
        status: 'completed',
        rpe: 8,
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
        hrvRmssd: 45,
        createdAt: '2026-01-05T08:00:00.000Z',
      },
    ];

    const weeks = buildMesoWeekStats(cfg, 1, sessions, sets, readiness, lifts, '2026-01-20');
    expect(weeks).not.toBeNull();
    expect(weeks!.length).toBe(4);
    expect(weeks![0].label).toBe('Accum W1');
    expect(weeks![3].isDeload).toBe(true);
    expect(weeks![0].sessionDays).toBe(1);
    expect(weeks![0].strengthVolumeLb).toBe(185 * 5);
    expect(weeks![0].avgRpe).toBe(8);
    expect(weeks![0].avgHrvRmssd).toBe(45);
    expect(weeks![0].sessionShortenedRate).toBe(0);
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
        prescriptionId: 'rx1',
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
    expect(report!.accumulationTrends.volume.length).toBeGreaterThan(10);
    expect(report!.strategyBullets.length).toBeGreaterThan(0);
    expect(report!.lengthRecommendation.action).toMatch(/extend|shorten|keep/);
  });

  it('formatAccumulationTrendLines compares early vs late accumulation', () => {
    const base = {
      weekInBlock: 1,
      label: 'Accum W1',
      weekStart: '2026-01-05',
      weekEnd: '2026-01-11',
      isDeload: false,
      isFuture: false,
      sessionsCompleted: 1,
      sessionDays: 1,
      prCount: 0,
      avgSoreness: 2,
      avgMotivation: 4,
      modifiedSetRate: 0,
      sessionCompletionRate: 1,
    };
    const w1 = {
      ...base,
      weekInBlock: 1,
      strengthVolumeLb: 10_000,
      avgRpe: 7,
      avgHrvRmssd: 40,
      sessionShortenedRate: 0.2,
    };
    const w2 = {
      ...base,
      weekInBlock: 2,
      label: 'Accum W2',
      weekStart: '2026-01-12',
      weekEnd: '2026-01-18',
      strengthVolumeLb: 14_000,
      avgRpe: 8.5,
      avgHrvRmssd: 35,
      sessionShortenedRate: 0.05,
    };
    const w3 = {
      ...base,
      weekInBlock: 3,
      label: 'Accum W3',
      weekStart: '2026-01-19',
      weekEnd: '2026-01-25',
      isDeload: true,
      strengthVolumeLb: 5000,
      avgRpe: 6,
      avgHrvRmssd: 42,
      sessionShortenedRate: 0,
    };
    const t = formatAccumulationTrendLines([w1, w2, w3] as MesoWeekStat[]);
    expect(t.volume).toMatch(/increased|decreased|stable|similar|Not enough/i);
    expect(t.rpe).toBeTruthy();
    expect(t.hrv).toBeTruthy();
    expect(t.shortened).toBeTruthy();
  });
});
