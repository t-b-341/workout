import { describe, expect, it } from 'vitest';
import type { Prescription, SetLog } from '@/lib/types';
import {
  expectedSetSlots,
  firstOpenPrescriptionId,
  sessionSetsForPrescriptions,
} from '@/lib/todaySessionUi';

const p1: Prescription = {
  id: 'p1',
  templateId: 'U1',
  liftId: 'a',
  order: 0,
  sets: 2,
  repMin: 5,
  repMax: 5,
  weight: 100,
  increment: 5,
  perSide: false,
};

const p2: Prescription = {
  ...p1,
  id: 'p2',
  liftId: 'b',
  order: 1,
  sets: 1,
  perSide: true,
};

describe('expectedSetSlots', () => {
  it('counts sides for per-side prescriptions', () => {
    expect(expectedSetSlots([p1])).toBe(2);
    expect(expectedSetSlots([p2])).toBe(2);
    expect(expectedSetSlots([p1, p2])).toBe(4);
  });
});

describe('firstOpenPrescriptionId', () => {
  it('returns first prescription with fewer rows than slots', () => {
    const sets: SetLog[] = [
      {
        id: 's1',
        sessionLogId: 'sess',
        liftId: 'a',
        prescriptionId: 'p1',
        setIndex: 0,
        weight: 100,
        reps: 5,
        status: 'completed',
        loggedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    expect(firstOpenPrescriptionId([p1], sets)).toBe('p1');
    sets.push({
      id: 's2',
      sessionLogId: 'sess',
      liftId: 'a',
      prescriptionId: 'p1',
      setIndex: 1,
      weight: 100,
      reps: 5,
      status: 'completed',
      loggedAt: '2026-01-01T00:01:00.000Z',
    });
    expect(firstOpenPrescriptionId([p1], sets)).toBe(null);
  });
});

describe('sessionSetsForPrescriptions', () => {
  it('filters by session and prescription ids', () => {
    const sets: SetLog[] = [
      {
        id: 'a',
        sessionLogId: 'sess',
        liftId: 'x',
        prescriptionId: 'p1',
        setIndex: 0,
        weight: 1,
        reps: 1,
        status: 'completed',
        loggedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'b',
        sessionLogId: 'other',
        liftId: 'x',
        prescriptionId: 'p1',
        setIndex: 0,
        weight: 1,
        reps: 1,
        status: 'completed',
        loggedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    expect(sessionSetsForPrescriptions('sess', [p1], sets)).toHaveLength(1);
  });
});
