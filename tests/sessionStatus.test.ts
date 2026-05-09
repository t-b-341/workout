import { describe, expect, it } from 'vitest';
import { deriveSessionStatus } from '@/lib/sessionStatus';
import type { Prescription, SessionLog, SetLog } from '@/lib/types';

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
