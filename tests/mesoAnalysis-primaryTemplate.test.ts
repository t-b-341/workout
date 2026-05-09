import { describe, expect, it } from 'vitest';
import { computeMesoAnalysis } from '@/lib/mesoAnalysis';
import { DEFAULT_PROGRAM_TARGETS_STORED, programTargetToExportRow } from '@/lib/programExportTargets';
import type { Lift, SessionLog, SetLog } from '@/lib/types';

const squatLift: Lift = {
  id: 'squat',
  name: 'Squat',
  equipment: 'barbell',
  loadUnit: 'lb',
  repUnit: 'reps',
  increment: 5,
};

describe('computeMesoAnalysis primary-template load trend', () => {
  it('uses the template with the most load-trend sets for loadDelta (not global first/last across templates)', () => {
    const prescriptions = [
      { id: 'pU1', templateId: 'U1' as const, liftId: 'squat', sets: 4, repMin: 5, repMax: 5, weight: 200 },
      { id: 'pU3', templateId: 'U3' as const, liftId: 'squat', sets: 4, repMin: 10, repMax: 12, weight: 150 },
    ];

    const session_logs: SessionLog[] = [
      {
        id: 's1',
        date: '2026-05-01',
        templateId: 'U1',
        mode: 'standard',
        deload: false,
        watchFlags: [],
      },
      {
        id: 's2',
        date: '2026-05-02',
        templateId: 'U3',
        mode: 'standard',
        deload: false,
        watchFlags: [],
      },
      {
        id: 's3',
        date: '2026-05-03',
        templateId: 'U3',
        mode: 'standard',
        deload: false,
        watchFlags: [],
      },
    ];

    const set_logs: SetLog[] = [
      {
        id: 'a',
        sessionLogId: 's1',
        liftId: 'squat',
        prescriptionId: 'pU1',
        setIndex: 0,
        intent: 'working',
        weight: 200,
        reps: 5,
        status: 'completed',
      },
      {
        id: 'b',
        sessionLogId: 's2',
        liftId: 'squat',
        prescriptionId: 'pU3',
        setIndex: 0,
        intent: 'working',
        weight: 150,
        reps: 10,
        status: 'completed',
      },
      {
        id: 'c',
        sessionLogId: 's3',
        liftId: 'squat',
        prescriptionId: 'pU3',
        setIndex: 0,
        intent: 'working',
        weight: 155,
        reps: 10,
        status: 'completed',
      },
    ];

    const report = computeMesoAnalysis({
      exportedAtIso: '2026-05-07T12:00:00.000Z',
      session_logs,
      set_logs,
      lifts: [squatLift],
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

    const row = report.volumeProgression?.find((r) => r.liftId === 'squat');
    expect(row?.primaryTemplateId).toBe('U3');
    expect(row?.firstWorkingSetLoad).toBe(150);
    expect(row?.lastWorkingSetLoad).toBe(155);
    expect(row?.loadDelta).toBe(5);
  });

  it('tie-breaks equal template load-set counts with lexicographically smallest TemplateId', () => {
    const prescriptions = [
      { id: 'pU1', templateId: 'U1' as const, liftId: 'squat', sets: 2, repMin: 5, repMax: 5, weight: 100 },
      { id: 'pU3', templateId: 'U3' as const, liftId: 'squat', sets: 2, repMin: 10, repMax: 12, weight: 100 },
    ];

    const session_logs: SessionLog[] = [
      {
        id: 'sU1',
        date: '2026-05-01',
        templateId: 'U1',
        mode: 'standard',
        deload: false,
        watchFlags: [],
      },
      {
        id: 'sU3',
        date: '2026-05-02',
        templateId: 'U3',
        mode: 'standard',
        deload: false,
        watchFlags: [],
      },
    ];

    const set_logs: SetLog[] = [
      {
        id: 'w1',
        sessionLogId: 'sU1',
        liftId: 'squat',
        prescriptionId: 'pU1',
        setIndex: 0,
        intent: 'working',
        weight: 200,
        reps: 5,
        status: 'completed',
      },
      {
        id: 'w2',
        sessionLogId: 'sU3',
        liftId: 'squat',
        prescriptionId: 'pU3',
        setIndex: 0,
        intent: 'working',
        weight: 150,
        reps: 10,
        status: 'completed',
      },
    ];

    const report = computeMesoAnalysis({
      exportedAtIso: '2026-05-07T12:00:00.000Z',
      session_logs,
      set_logs,
      lifts: [squatLift],
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

    const row = report.volumeProgression?.find((r) => r.liftId === 'squat');
    expect(row?.primaryTemplateId).toBe('U1');
    expect(row?.loadDelta).toBe(0);
  });
});
