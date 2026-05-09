import { describe, expect, it } from 'vitest';
import { computeMesoAnalysis } from '@/lib/mesoAnalysis';
import { DEFAULT_PROGRAM_TARGETS_STORED, programTargetToExportRow } from '@/lib/programExportTargets';
import type { Lift, SessionLog, SetLog } from '@/lib/types';

describe('computeMesoAnalysis ghost exclusion', () => {
  it('does not count programmed volume from ghost sessions toward completionRates', () => {
    const lifts: Lift[] = [
      {
        id: 'squat',
        name: 'Squat',
        equipment: 'barbell',
        loadUnit: 'lb',
        repUnit: 'reps',
        increment: 5,
      },
    ];

    const prescriptions = [
      { id: 'p1', templateId: 'U1' as const, liftId: 'squat', sets: 4, repMin: 5, repMax: 5, weight: 100 },
    ];

    const session_logs: SessionLog[] = [
      {
        id: 'ghost',
        date: '2026-05-01',
        templateId: 'U1',
        mode: 'standard',
        deload: false,
        watchFlags: [],
      },
      {
        id: 'real',
        date: '2026-05-02',
        templateId: 'U1',
        mode: 'standard',
        deload: false,
        watchFlags: [],
      },
    ];

    const set_logs: SetLog[] = [
      {
        id: 'one',
        sessionLogId: 'real',
        liftId: 'squat',
        prescriptionId: 'p1',
        setIndex: 0,
        weight: 100,
        reps: 5,
        status: 'completed',
      },
    ];

    const report = computeMesoAnalysis({
      exportedAtIso: '2026-05-07T12:00:00.000Z',
      session_logs,
      set_logs,
      lifts,
      prescriptions,
      readiness_logs: [],
      bodyweight_logs: [],
      nutrition_logs: [],
      sleep_logs: [],
      stress_logs: [],
      mindfulness_logs: [],
      injury_episodes: [],
      programTargets: DEFAULT_PROGRAM_TARGETS_STORED.map(programTargetToExportRow),
      body_measurement_logs: [],
      mesoStartDate: '2026-05-01',
      mesoEndDate: '2026-05-07',
    });

    const squat = report.completionRates?.find((r) => r.liftId === 'squat');
    expect(squat?.programmedSets).toBe(4);
    expect(squat?.completedSets).toBe(1);
  });
});
