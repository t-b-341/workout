import { describe, expect, it } from 'vitest';
import {
  rollingStrengthTrainingWindow,
  sessionFinishHighlights,
  sessionRecapPRs,
  sessionRecapSummaryLines,
  sessionStrengthDensity,
  sessionTotalRestBetweenSetsMs,
  sortSetsChronologically,
} from '../src/lib/stats';
import type { Lift, SessionLog, SetLog, TemplateId } from '../src/lib/types';

const liftBench: Lift = {
  id: 'bp',
  name: 'Bench',
  equipment: 'barbell',
  loadUnit: 'lb',
  repUnit: 'reps',
  increment: 5,
  muscleGroups: ['chest'],
  pattern: 'horiz-push',
};

function sess(id: string, date: string, templateId: TemplateId = 'U1'): SessionLog {
  return {
    id,
    date,
    templateId,
    mode: 'standard',
    deload: false,
    watchFlags: [],
  };
}

describe('sortSetsChronologically', () => {
  it('orders same calendar day by session id (lexicographic), then set index, then side', () => {
    const sessions = [sess('2026-04-20-U2', '2026-04-20', 'U2'), sess('2026-04-20-U1', '2026-04-20', 'U1')];
    const sets: SetLog[] = [
      {
        id: 'b-0',
        sessionLogId: '2026-04-20-U1',
        liftId: 'bp',
        prescriptionId: 'p1',
        setIndex: 1,
        weight: 100,
        reps: 5,
        status: 'completed',
      },
      {
        id: 'a-0',
        sessionLogId: '2026-04-20-U2',
        liftId: 'bp',
        prescriptionId: 'p1',
        setIndex: 0,
        weight: 90,
        reps: 5,
        status: 'completed',
      },
      {
        id: 'a-1',
        sessionLogId: '2026-04-20-U2',
        liftId: 'bp',
        prescriptionId: 'p1',
        setIndex: 1,
        weight: 90,
        reps: 5,
        status: 'completed',
      },
    ];
    const ordered = sortSetsChronologically(sets, sessions);
    // U1 < U2 as strings, so U1 session (b-0) comes first.
    expect(ordered.map((s) => s.id)).toEqual(['b-0', 'a-0', 'a-1']);
  });

  it('orders L side before R for the same set index', () => {
    const sessions = [sess('2026-04-21-U1', '2026-04-21')];
    const sets: SetLog[] = [
      {
        id: 'r',
        sessionLogId: '2026-04-21-U1',
        liftId: 'bp',
        prescriptionId: 'p1',
        setIndex: 0,
        side: 'R',
        weight: 50,
        reps: 8,
        status: 'completed',
      },
      {
        id: 'l',
        sessionLogId: '2026-04-21-U1',
        liftId: 'bp',
        prescriptionId: 'p1',
        setIndex: 0,
        side: 'L',
        weight: 50,
        reps: 8,
        status: 'completed',
      },
    ];
    const ordered = sortSetsChronologically(sets, sessions);
    expect(ordered.map((s) => s.id)).toEqual(['l', 'r']);
  });
});

describe('sessionRecapPRs', () => {
  it('returns PR rows for sets that beat prior history', () => {
    const sessions = [sess('day1', '2026-04-01'), sess('day2', '2026-04-08')];
    const sets: SetLog[] = [
      {
        id: '1',
        sessionLogId: 'day1',
        liftId: 'bp',
        prescriptionId: 'p',
        setIndex: 0,
        weight: 100,
        reps: 5,
        status: 'completed',
      },
      {
        id: '2',
        sessionLogId: 'day2',
        liftId: 'bp',
        prescriptionId: 'p',
        setIndex: 0,
        weight: 105,
        reps: 5,
        status: 'completed',
      },
    ];
    const prs = sessionRecapPRs('day2', sets, sessions, [liftBench]);
    expect(prs).toHaveLength(1);
    expect(prs[0].liftName).toBe('Bench');
    expect(prs[0].weight).toBe(105);
    expect(prs[0].repPR).toBe(true);
  });

  it('returns empty when session does not beat prior bests', () => {
    const sessions = [sess('day1', '2026-04-01'), sess('day2', '2026-04-08')];
    const sets: SetLog[] = [
      {
        id: '1',
        sessionLogId: 'day1',
        liftId: 'bp',
        prescriptionId: 'p',
        setIndex: 0,
        weight: 100,
        reps: 5,
        status: 'completed',
      },
      {
        id: '2',
        sessionLogId: 'day2',
        liftId: 'bp',
        prescriptionId: 'p',
        setIndex: 0,
        weight: 100,
        reps: 5,
        status: 'completed',
      },
    ];
    const prs = sessionRecapPRs('day2', sets, sessions, [liftBench]);
    expect(prs).toHaveLength(0);
  });
});

describe('sessionFinishHighlights', () => {
  it('sums strength volume and counts distinct lifts', () => {
    const lifts = [liftBench];
    const sets: SetLog[] = [
      {
        id: '1',
        sessionLogId: 's1',
        liftId: 'bp',
        prescriptionId: 'p',
        setIndex: 0,
        weight: 100,
        reps: 5,
        status: 'completed',
      },
      {
        id: '2',
        sessionLogId: 's1',
        liftId: 'bp',
        prescriptionId: 'p',
        setIndex: 1,
        weight: 100,
        reps: 5,
        status: 'completed',
      },
    ];
    const h = sessionFinishHighlights('s1', sets, lifts);
    expect(h.completedSetCount).toBe(2);
    expect(h.strengthVolumeLb).toBe(1000);
    expect(h.distinctLifts).toBe(1);
    expect(h.topSet?.weight).toBe(100);
    expect(h.topSet?.reps).toBe(5);
    expect(h.totalRestBetweenSetsMs).toBe(0);
  });
});

describe('sessionTotalRestBetweenSetsMs', () => {
  it('sums positive gaps between consecutive logged sets (session-wide order)', () => {
    const sets: SetLog[] = [
      {
        id: '1',
        sessionLogId: 's1',
        liftId: 'bp',
        prescriptionId: 'p',
        setIndex: 0,
        weight: 100,
        reps: 5,
        status: 'completed',
        loggedAt: '2026-01-01T10:00:00.000Z',
      },
      {
        id: '2',
        sessionLogId: 's1',
        liftId: 'ohp',
        prescriptionId: 'p2',
        setIndex: 0,
        weight: 95,
        reps: 5,
        status: 'completed',
        loggedAt: '2026-01-01T10:01:30.000Z',
      },
      {
        id: '3',
        sessionLogId: 's1',
        liftId: 'bp',
        prescriptionId: 'p',
        setIndex: 1,
        weight: 100,
        reps: 5,
        status: 'completed',
        loggedAt: '2026-01-01T10:03:00.000Z',
      },
    ];
    expect(sessionTotalRestBetweenSetsMs('s1', sets)).toBe(90_000 + 90_000);
  });

  it('ignores gaps longer than 2 hours', () => {
    const sets: SetLog[] = [
      {
        id: '1',
        sessionLogId: 's1',
        liftId: 'bp',
        prescriptionId: 'p',
        setIndex: 0,
        weight: 100,
        reps: 5,
        status: 'completed',
        loggedAt: '2026-01-01T10:00:00.000Z',
      },
      {
        id: '2',
        sessionLogId: 's1',
        liftId: 'bp',
        prescriptionId: 'p',
        setIndex: 1,
        weight: 100,
        reps: 5,
        status: 'completed',
        loggedAt: '2026-01-01T14:00:00.000Z',
      },
    ];
    expect(sessionTotalRestBetweenSetsMs('s1', sets)).toBe(0);
  });

  it('subtracts logged cardio minutes from a gap (so treadmill time is not rest)', () => {
    const lifts: Lift[] = [
      liftBench,
      {
        id: 'liss',
        name: 'LISS',
        equipment: 'cardio',
        loadUnit: 'none',
        repUnit: 'minutes',
        increment: 1,
        muscleGroups: [],
        pattern: 'cardio',
      },
    ];
    const sets = [
      {
        id: '1',
        sessionLogId: 's1',
        liftId: 'bp',
        prescriptionId: 'p',
        setIndex: 0,
        weight: 100,
        reps: 5,
        status: 'completed' as const,
        loggedAt: '2026-01-01T10:00:00.000Z',
      },
      {
        id: '2',
        sessionLogId: 's1',
        liftId: 'liss',
        prescriptionId: 'p2',
        setIndex: 0,
        weight: 0,
        reps: 30,
        status: 'completed' as const,
        loggedAt: '2026-01-01T10:35:00.000Z',
      },
    ];
    const gapMs = 35 * 60 * 1000;
    const cardioMs = 30 * 60 * 1000;
    expect(sessionTotalRestBetweenSetsMs('s1', sets, lifts)).toBe(gapMs - cardioMs);
  });
});

describe('sessionRecapSummaryLines', () => {
  it('includes duration and PR line when provided', () => {
    const lines = sessionRecapSummaryLines({
      highlights: {
        completedSetCount: 3,
        strengthVolumeLb: 3000,
        distinctLifts: 2,
        bestSessionE1RmLb: 200,
        topSet: { liftName: 'Bench', weight: 100, reps: 5 },
        reduced: 0,
        skipped: 0,
        substituted: 0,
        totalRestBetweenSetsMs: 0,
      },
      progression: { advanced: 1, held: 0, skipped: 0 },
      prCount: 1,
      durationMs: 45 * 60 * 1000 + 30 * 1000,
      templateName: 'Upper A',
    });
    expect(lines.some((l) => l.includes('45m'))).toBe(true);
    expect(lines.some((l) => /personal record/i.test(l))).toBe(true);
  });

  it('includes strength lb/h when provided', () => {
    const lines = sessionRecapSummaryLines({
      highlights: {
        completedSetCount: 3,
        strengthVolumeLb: 3000,
        distinctLifts: 2,
        bestSessionE1RmLb: 200,
        topSet: { liftName: 'Bench', weight: 100, reps: 5 },
        reduced: 0,
        skipped: 0,
        substituted: 0,
        totalRestBetweenSetsMs: 0,
      },
      progression: { advanced: 0, held: 0, skipped: 0 },
      prCount: 0,
      durationMs: 60 * 60 * 1000,
      strengthLbPerHour: 3000,
      templateName: 'Upper A',
    });
    expect(lines.some((l) => /per clock hour/i.test(l))).toBe(true);
  });

  it('skips progression bullets when omitProgression', () => {
    const lines = sessionRecapSummaryLines({
      highlights: {
        completedSetCount: 3,
        strengthVolumeLb: 3000,
        distinctLifts: 2,
        bestSessionE1RmLb: 200,
        topSet: { liftName: 'Bench', weight: 100, reps: 5 },
        reduced: 0,
        skipped: 0,
        substituted: 0,
        totalRestBetweenSetsMs: 0,
      },
      progression: { advanced: 2, held: 1, skipped: 0 },
      prCount: 0,
      durationMs: null,
      templateName: 'Upper A',
      omitProgression: true,
    });
    expect(lines.some((l) => /heavier next session/i.test(l))).toBe(false);
    expect(lines.some((l) => /held steady/i.test(l))).toBe(false);
  });
});

describe('sessionStrengthDensity', () => {
  it('computes lb/h from wall-clock session length', () => {
    const session: SessionLog = {
      ...sess('s1', '2026-04-01'),
      startedAt: '2026-04-01T10:00:00.000Z',
      completedAt: '2026-04-01T11:00:00.000Z',
    };
    const sets: SetLog[] = [
      {
        id: '1',
        sessionLogId: 's1',
        liftId: 'bp',
        prescriptionId: 'p',
        setIndex: 0,
        weight: 100,
        reps: 10,
        status: 'completed',
      },
    ];
    const d = sessionStrengthDensity(session, sets, [liftBench]);
    expect(d.strengthVolumeLb).toBe(1000);
    expect(d.durationMs).toBe(60 * 60 * 1000);
    expect(d.lbPerHour).toBeCloseTo(1000, 5);
  });

  it('returns null lb/h without startedAt', () => {
    const session = sess('s1', '2026-04-01');
    const sets: SetLog[] = [
      {
        id: '1',
        sessionLogId: 's1',
        liftId: 'bp',
        prescriptionId: 'p',
        setIndex: 0,
        weight: 100,
        reps: 5,
        status: 'completed',
      },
    ];
    const d = sessionStrengthDensity(session, sets, [liftBench]);
    expect(d.lbPerHour).toBeNull();
  });
});

describe('rollingStrengthTrainingWindow', () => {
  it('sums completed sessions in inclusive calendar window', () => {
    const sessions: SessionLog[] = [
      {
        ...sess('a', '2026-04-27'),
        startedAt: '2026-04-27T12:00:00.000Z',
        completedAt: '2026-04-27T13:00:00.000Z',
      },
      {
        ...sess('b', '2026-04-28'),
        startedAt: '2026-04-28T12:00:00.000Z',
        completedAt: '2026-04-28T12:30:00.000Z',
      },
      {
        ...sess('c', '2026-03-01'),
        startedAt: '2026-03-01T12:00:00.000Z',
        completedAt: '2026-03-01T13:00:00.000Z',
      },
    ];
    const sets: SetLog[] = [
      {
        id: '1',
        sessionLogId: 'a',
        liftId: 'bp',
        prescriptionId: 'p',
        setIndex: 0,
        weight: 100,
        reps: 10,
        status: 'completed',
      },
      {
        id: '2',
        sessionLogId: 'b',
        liftId: 'bp',
        prescriptionId: 'p',
        setIndex: 0,
        weight: 100,
        reps: 5,
        status: 'completed',
      },
      {
        id: '3',
        sessionLogId: 'c',
        liftId: 'bp',
        prescriptionId: 'p',
        setIndex: 0,
        weight: 200,
        reps: 10,
        status: 'completed',
      },
    ];
    const r = rollingStrengthTrainingWindow('2026-04-28', 2, sessions, sets, [liftBench]);
    expect(r.startDate).toBe('2026-04-27');
    expect(r.endDate).toBe('2026-04-28');
    expect(r.completedSessions).toBe(2);
    expect(r.strengthVolumeLb).toBe(1500);
    expect(r.trainingDurationMs).toBe(60 * 60 * 1000 + 30 * 60 * 1000);
    expect(r.lbPerTrainingHour).toBeCloseTo(1000, 5);
    expect(r.strengthVolumeLbPerCalendarDay).toBe(750);
  });

  it('ignores sessions without completedAt', () => {
    const sessions: SessionLog[] = [{ ...sess('open', '2026-04-28') }];
    const sets: SetLog[] = [
      {
        id: '1',
        sessionLogId: 'open',
        liftId: 'bp',
        prescriptionId: 'p',
        setIndex: 0,
        weight: 100,
        reps: 10,
        status: 'completed',
      },
    ];
    const r = rollingStrengthTrainingWindow('2026-04-28', 7, sessions, sets, [liftBench]);
    expect(r.completedSessions).toBe(0);
    expect(r.strengthVolumeLb).toBe(0);
    expect(r.lbPerTrainingHour).toBeNull();
  });
});
