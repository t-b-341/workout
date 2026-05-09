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

function baseSession(): SessionLog {
  return {
    id: 's1',
    date: '2026-05-02',
    templateId: 'U1',
    mode: 'standard',
    deload: false,
    watchFlags: [],
  };
}

describe('repRangeCompliance', () => {
  it('reports compliance from completed working sets vs prescription rep range (≥3 sets)', () => {
    const prescriptions = [
      { id: 'p1', templateId: 'U1' as const, liftId: 'squat', sets: 4, repMin: 8, repMax: 12, weight: 100 },
    ];
    const session_logs = [baseSession()];
    const set_logs: SetLog[] = [5, 5, 5, 10].map((reps, i) => ({
      id: `x${i}`,
      sessionLogId: 's1',
      liftId: 'squat',
      prescriptionId: 'p1',
      setIndex: i,
      intent: 'working' as const,
      weight: 100,
      reps,
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

    const row = report.repRangeCompliance?.find((r) => r.liftId === 'squat');
    expect(row).toBeDefined();
    expect(row!.compliancePct).toBe(25);
    expect(row!.belowRangeSets).toBe(3);
    expect(row!.aboveRangeSets).toBe(0);
    expect(row!.note).toContain('below range');
  });

  it('sets note to null when compliance is ≥70%', () => {
    const prescriptions = [
      { id: 'p1', templateId: 'U1' as const, liftId: 'squat', sets: 4, repMin: 8, repMax: 12, weight: 100 },
    ];
    const session_logs = [baseSession()];
    const set_logs: SetLog[] = [10, 10, 10].map((reps, i) => ({
      id: `x${i}`,
      sessionLogId: 's1',
      liftId: 'squat',
      prescriptionId: 'p1',
      setIndex: i,
      intent: 'working' as const,
      weight: 100,
      reps,
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

    const row = report.repRangeCompliance?.find((r) => r.liftId === 'squat');
    expect(row?.compliancePct).toBe(100);
    expect(row?.note).toBeNull();
  });

  it('appends rep-range flag to liftRecommendations rationale when compliancePct < 70%', () => {
    const prescriptions = [
      { id: 'p1', templateId: 'U1' as const, liftId: 'squat', sets: 8, repMin: 8, repMax: 12, weight: 100 },
    ];
    const session_logs = [baseSession()];
    const set_logs: SetLog[] = [5, 5, 5, 10].map((reps, i) => ({
      id: `x${i}`,
      sessionLogId: 's1',
      liftId: 'squat',
      prescriptionId: 'p1',
      setIndex: i,
      intent: 'working' as const,
      weight: 100,
      reps,
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
    expect(rec).toBeDefined();
    expect(rec!.rationale).toContain('below range');
  });
});
