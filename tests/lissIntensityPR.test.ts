import { describe, expect, it } from 'vitest';
import { detectLissIntensityPR, sessionRecapPRs } from '@/lib/stats';
import type { Lift, SessionLog, SetLog } from '@/lib/types';

const liftLiss: Lift = {
  id: 'liss',
  name: 'LISS',
  equipment: 'cardio',
  loadUnit: 'none',
  repUnit: 'minutes',
  increment: 1,
  pattern: 'cardio',
};

function sess(id: string, date: string): SessionLog {
  return {
    id,
    date,
    templateId: 'L1',
    mode: 'standard',
    deload: false,
    watchFlags: [],
  };
}

describe('detectLissIntensityPR', () => {
  it('flags speed PR when mph beats prior max', () => {
    const prior: SetLog[] = [
      {
        id: 'a',
        sessionLogId: 's1',
        liftId: 'liss',
        prescriptionId: 'p',
        setIndex: 0,
        weight: 0,
        reps: 30,
        status: 'completed',
        speedMph: 2.2,
        gradePct: 3,
      },
    ];
    const cur: SetLog = {
      id: 'b',
      sessionLogId: 's2',
      liftId: 'liss',
      prescriptionId: 'p',
      setIndex: 0,
      weight: 0,
      reps: 30,
      status: 'completed',
      speedMph: 2.5,
      gradePct: 3,
    };
    const r = detectLissIntensityPR(cur, prior);
    expect(r?.speedPR).toBe(true);
    expect(r?.inclinePR).toBe(false);
  });

  it('flags incline PR when grade beats prior max', () => {
    const prior: SetLog[] = [
      {
        id: 'a',
        sessionLogId: 's1',
        liftId: 'liss',
        prescriptionId: 'p',
        setIndex: 0,
        weight: 0,
        reps: 20,
        status: 'completed',
        speedMph: 2,
        gradePct: 4,
      },
    ];
    const cur: SetLog = {
      id: 'b',
      sessionLogId: 's2',
      liftId: 'liss',
      prescriptionId: 'p',
      setIndex: 0,
      weight: 0,
      reps: 20,
      status: 'completed',
      speedMph: 2,
      gradePct: 6,
    };
    const r = detectLissIntensityPR(cur, prior);
    expect(r?.speedPR).toBe(false);
    expect(r?.inclinePR).toBe(true);
  });

  it('does not award incline PR for flat when prior hill exists', () => {
    const prior: SetLog[] = [
      {
        id: 'a',
        sessionLogId: 's1',
        liftId: 'liss',
        prescriptionId: 'p',
        setIndex: 0,
        weight: 0,
        reps: 30,
        status: 'completed',
        speedMph: 2,
        gradePct: 5,
      },
    ];
    const cur: SetLog = {
      id: 'b',
      sessionLogId: 's2',
      liftId: 'liss',
      prescriptionId: 'p',
      setIndex: 0,
      weight: 0,
      reps: 30,
      status: 'completed',
      speedMph: 2,
      gradePct: 0,
    };
    expect(detectLissIntensityPR(cur, prior)).toBeNull();
  });
});

describe('sessionRecapPRs LISS', () => {
  it('includes LISS intensity PR rows', () => {
    const sessions = [sess('day1', '2026-04-01'), sess('day2', '2026-04-08')];
    const sets: SetLog[] = [
      {
        id: '1',
        sessionLogId: 'day1',
        liftId: 'liss',
        prescriptionId: 'p',
        setIndex: 0,
        weight: 0,
        reps: 30,
        status: 'completed',
        speedMph: 2,
        gradePct: 3,
      },
      {
        id: '2',
        sessionLogId: 'day2',
        liftId: 'liss',
        prescriptionId: 'p',
        setIndex: 0,
        weight: 0,
        reps: 30,
        status: 'completed',
        speedMph: 2.5,
        gradePct: 3,
      },
    ];
    const prs = sessionRecapPRs('day2', sets, sessions, [liftLiss]);
    expect(prs).toHaveLength(1);
    expect(prs[0].liftId).toBe('liss');
    expect(prs[0].speedPR).toBe(true);
    expect(prs[0].speedMph).toBe(2.5);
  });
});
