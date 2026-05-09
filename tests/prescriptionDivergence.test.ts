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

describe('prescriptionDivergence', () => {
  it('lists lifts when mean actual working weight differs from prescribed by >10%', () => {
    const prescriptions = [
      {
        id: 'p1',
        templateId: 'U1' as const,
        liftId: 'squat',
        sets: 4,
        repMin: 5,
        repMax: 5,
        weight: 100,
      },
    ];
    const session_logs: SessionLog[] = [
      {
        id: 's1',
        date: '2026-05-02',
        templateId: 'U1',
        mode: 'standard',
        deload: false,
        watchFlags: [],
      },
      {
        id: 's2',
        date: '2026-05-06',
        templateId: 'U1',
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
        prescriptionId: 'p1',
        setIndex: 0,
        intent: 'working',
        weight: 125,
        reps: 5,
        status: 'completed',
      },
      {
        id: 'b',
        sessionLogId: 's2',
        liftId: 'squat',
        prescriptionId: 'p1',
        setIndex: 0,
        intent: 'working',
        weight: 125,
        reps: 5,
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

    const row = report.prescriptionDivergence?.find((r) => r.liftId === 'squat');
    expect(row).toBeDefined();
    expect(row!.prescribedWeight).toBe(100);
    expect(row!.avgActualWeight).toBe(125);
    expect(row!.divergencePct).toBe(25);
    expect(row!.direction).toBe('over');
    expect(row!.sessionsLogged).toBe(2);
    expect(row!.suggestPrescriptionUpdate).toBe(true);
  });

  it('does not suggest update when divergence is large but only one session', () => {
    const prescriptions = [
      {
        id: 'p1',
        templateId: 'U1' as const,
        liftId: 'squat',
        sets: 4,
        repMin: 5,
        repMax: 5,
        weight: 100,
      },
    ];
    const session_logs: SessionLog[] = [
      {
        id: 's1',
        date: '2026-05-02',
        templateId: 'U1',
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
        prescriptionId: 'p1',
        setIndex: 0,
        intent: 'working',
        weight: 125,
        reps: 5,
        status: 'completed',
      },
      {
        id: 'b',
        sessionLogId: 's1',
        liftId: 'squat',
        prescriptionId: 'p1',
        setIndex: 1,
        intent: 'working',
        weight: 125,
        reps: 5,
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

    const row = report.prescriptionDivergence?.find((r) => r.liftId === 'squat');
    expect(row?.sessionsLogged).toBe(1);
    expect(row?.suggestPrescriptionUpdate).toBe(false);
  });
});
