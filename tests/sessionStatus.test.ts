import { describe, expect, it } from 'vitest';
import { deriveSessionStatus, isEmptySession } from '@/lib/sessionStatus';
import type { Prescription, ReadinessLog, SessionLog, SetLog } from '@/lib/types';

const baseSession = (): SessionLog => ({
  id: 's1',
  date: '2026-05-01',
  templateId: 'U1',
  mode: 'standard',
  deload: false,
  watchFlags: [],
});

const rx = (): Prescription[] => [
  {
    id: 'p1',
    templateId: 'U1',
    liftId: 'squat',
    order: 0,
    weight: 100,
    sets: 4,
    repMin: 5,
    repMax: 5,
    increment: 5,
  },
];

describe('deriveSessionStatus', () => {
  it('returns ghost when no sets and not skipped', () => {
    expect(deriveSessionStatus(baseSession(), rx(), [])).toBe('ghost');
  });

  it('returns skipped when sessionStatus is skipped even with no sets', () => {
    expect(deriveSessionStatus({ ...baseSession(), sessionStatus: 'skipped' }, rx(), [])).toBe('skipped');
  });

  it('returns skipped when mode is skip and no sets', () => {
    expect(deriveSessionStatus({ ...baseSession(), mode: 'skip' }, rx(), [])).toBe('skipped');
  });

  it('returns partial when completion < 50%', () => {
    const sets: SetLog[] = [
      {
        id: 'x1',
        sessionLogId: 's1',
        liftId: 'squat',
        prescriptionId: 'p1',
        setIndex: 0,
        weight: 100,
        reps: 5,
        status: 'completed',
      },
    ];
    expect(deriveSessionStatus(baseSession(), rx(), sets)).toBe('partial');
  });

  it('returns completed when completion >= 50%', () => {
    const sets: SetLog[] = Array.from({ length: 2 }, (_, i) => ({
      id: `x${i}`,
      sessionLogId: 's1',
      liftId: 'squat',
      prescriptionId: 'p1',
      setIndex: i,
      weight: 100,
      reps: 5,
      status: 'completed' as const,
    }));
    expect(deriveSessionStatus(baseSession(), rx(), sets)).toBe('completed');
  });
});

function oneSet(sessionLogId: string): SetLog {
  return {
    id: `set-${sessionLogId}`,
    sessionLogId,
    liftId: 'squat',
    prescriptionId: 'p1',
    setIndex: 0,
    weight: 100,
    reps: 5,
    status: 'completed',
  };
}

function oneReadiness(sessionLogId: string): ReadinessLog {
  return {
    id: `readiness-${sessionLogId}`,
    sessionLogId,
    date: '2026-05-01',
    sleepHours: 8,
    soreness: 2,
    motivation: 3,
    createdAt: '2026-05-01T12:00:00.000Z',
  };
}

describe('isEmptySession', () => {
  it('is true for a bare row', () => {
    expect(isEmptySession(baseSession(), [], null)).toBe(true);
  });

  it('is false when the session has sets', () => {
    expect(isEmptySession(baseSession(), [oneSet('s1')], null)).toBe(false);
  });

  it('is false when a readiness log is present', () => {
    const readiness = oneReadiness('s1');
    expect(isEmptySession(baseSession(), [], readiness)).toBe(false);
    expect(isEmptySession(baseSession(), [], [readiness])).toBe(false);
  });

  it('is false when startedAt is set', () => {
    expect(
      isEmptySession({ ...baseSession(), startedAt: '2026-05-01T12:00:00.000Z' }, [], null),
    ).toBe(false);
  });

  it('is false when completedAt is set', () => {
    expect(
      isEmptySession({ ...baseSession(), completedAt: '2026-05-01T13:00:00.000Z' }, [], null),
    ).toBe(false);
  });

  it('is false when reason is set', () => {
    expect(isEmptySession({ ...baseSession(), reason: 'poor sleep' }, [], null)).toBe(false);
  });

  it('is false when notes are set', () => {
    expect(isEmptySession({ ...baseSession(), notes: 'elbow tweak' }, [], null)).toBe(false);
  });

  it('is false when mode is skip', () => {
    expect(isEmptySession({ ...baseSession(), mode: 'skip' }, [], null)).toBe(false);
  });

  it('is false when sessionStatus is skipped', () => {
    expect(isEmptySession({ ...baseSession(), sessionStatus: 'skipped' }, [], null)).toBe(false);
  });

  it('ignores sets and readiness that belong to another session', () => {
    expect(isEmptySession(baseSession(), [oneSet('other')], [oneReadiness('other')])).toBe(true);
  });
});
