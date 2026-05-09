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

describe('liftRecommendations short-window thresholds', () => {
  it('includes a lift with 3 completed primary-template working sets (not only ≥4)', () => {
    const prescriptions = [
      { id: 'p1', templateId: 'U1' as const, liftId: 'squat', sets: 3, repMin: 5, repMax: 5, weight: 100 },
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
    const set_logs: SetLog[] = [0, 1, 2].map((setIndex) => ({
      id: `x${setIndex}`,
      sessionLogId: 's1',
      liftId: 'squat',
      prescriptionId: 'p1',
      setIndex,
      intent: 'working' as const,
      weight: 100,
      reps: 5,
      status: 'completed' as const,
    }));

    const squatTarget = programTargetToExportRow({
      id: 'squat_ws_test',
      label: 'Squat',
      metric: 'working_set',
      targetValue: 500,
      targetReps: null,
      targetSets: null,
      currentValue: null,
      unit: 'lb',
      liftId: 'squat',
    });

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
      programTargets: [...DEFAULT_PROGRAM_TARGETS_STORED.map(programTargetToExportRow), squatTarget],
      body_measurement_logs: [],
      mesoStartDate: '2026-05-01',
      mesoEndDate: '2026-05-07',
    });

    const rec = report.liftRecommendations?.find((r) => r.liftId === 'squat');
    expect(rec).toBeDefined();
    expect(rec!.recommendation).not.toBe('monitor');
  });

  it('when programmed ≥3 sets but <3 completed working sets, recommends monitor with insufficiency rationale', () => {
    const prescriptions = [
      { id: 'p1', templateId: 'U1' as const, liftId: 'squat', sets: 4, repMin: 5, repMax: 5, weight: 100 },
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
    const set_logs: SetLog[] = [0, 1].map((setIndex) => ({
      id: `x${setIndex}`,
      sessionLogId: 's1',
      liftId: 'squat',
      prescriptionId: 'p1',
      setIndex,
      intent: 'working' as const,
      weight: 100,
      reps: 5,
      status: 'completed' as const,
    }));

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

    const rec = report.liftRecommendations?.find((r) => r.liftId === 'squat');
    expect(rec?.recommendation).toBe('monitor');
    expect(rec?.rationale).toContain('Insufficient completed sets (2)');
    expect(rec?.rationale).toContain('intent tagging');
  });

  it('does not add low-data monitor when programmed sets in window < 3', () => {
    const prescriptions = [
      { id: 'p1', templateId: 'U1' as const, liftId: 'squat', sets: 2, repMin: 5, repMax: 5, weight: 100 },
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
    const set_logs: SetLog[] = [0].map((setIndex) => ({
      id: `x${setIndex}`,
      sessionLogId: 's1',
      liftId: 'squat',
      prescriptionId: 'p1',
      setIndex,
      intent: 'working' as const,
      weight: 100,
      reps: 5,
      status: 'completed' as const,
    }));

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

    expect(report.liftRecommendations?.some((r) => r.liftId === 'squat')).toBeFalsy();
  });
});
