import { describe, expect, it } from 'vitest';
import { sessionRecapPRs, sortSetsChronologically } from '../src/lib/stats';
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
