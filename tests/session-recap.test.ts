import { describe, expect, it } from 'vitest';
import {
  sessionFinishHighlights,
  sessionRecapPRs,
  sessionRecapSummaryLines,
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
});
