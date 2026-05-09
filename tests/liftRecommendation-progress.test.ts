import { describe, expect, it } from 'vitest';
import { computeMesoAnalysis } from '@/lib/mesoAnalysis';
import { programTargetToExportRow } from '@/lib/programExportTargets';
import type { Lift, SessionLog, SetLog } from '@/lib/types';

const squatLift: Lift = {
  id: 'squat',
  name: 'Squat',
  equipment: 'barbell',
  loadUnit: 'lb',
  repUnit: 'reps',
  increment: 5,
};

/** Working-set target far above logged loads so `lastLoad < target * 0.9`. */
const squatHighTarget = programTargetToExportRow({
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

describe('liftRecommendations progress path', () => {
  it('recommends progress with load up when loadDelta > 0', () => {
    const prescriptions = [
      { id: 'p1', templateId: 'U1' as const, liftId: 'squat', sets: 2, repMin: 5, repMax: 5, weight: 100 },
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
        templateId: 'U1',
        mode: 'standard',
        deload: false,
        watchFlags: [],
      },
    ];
    const set_logs: SetLog[] = [
      ['s1', 0, 100],
      ['s1', 1, 100],
      ['s2', 0, 108],
      ['s2', 1, 110],
    ].map(([sessionLogId, setIndex, weight]) => ({
      id: `id-${String(sessionLogId)}-${setIndex}`,
      sessionLogId: sessionLogId as string,
      liftId: 'squat',
      prescriptionId: 'p1',
      setIndex: setIndex as number,
      intent: 'working' as const,
      weight: weight as number,
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
      programTargets: [squatHighTarget],
      body_measurement_logs: [],
      mesoStartDate: '2026-05-01',
      mesoEndDate: '2026-05-07',
    });

    const rec = report.liftRecommendations?.find((r) => r.liftId === 'squat');
    expect(rec?.recommendation).toBe('progress');
    expect(rec?.rationale).toContain('load up 10 lb');
    expect(rec?.rationale).not.toContain('up 0 lb');
  });

  it('when loadDelta === 0, progress only if working sets are at prescription rep ceiling', () => {
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
    const set_logs: SetLog[] = [5, 5, 5, 4].map((reps, i) => ({
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
      programTargets: [squatHighTarget],
      body_measurement_logs: [],
      mesoStartDate: '2026-05-01',
      mesoEndDate: '2026-05-07',
    });

    const rec = report.liftRecommendations?.find((r) => r.liftId === 'squat');
    expect(rec?.recommendation).toBe('hold');
    expect(rec?.rationale).toContain(
      'Load held flat at 100 lb with 100% completion — maintain load and push rep ceiling before adding weight.',
    );
  });

  it('when loadDelta === 0 and all working sets hit repMax, still hold — push rep ceiling before adding weight', () => {
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
    const set_logs: SetLog[] = [5, 5, 5, 5].map((reps, i) => ({
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
      programTargets: [squatHighTarget],
      body_measurement_logs: [],
      mesoStartDate: '2026-05-01',
      mesoEndDate: '2026-05-07',
    });

    const rec = report.liftRecommendations?.find((r) => r.liftId === 'squat');
    expect(rec?.recommendation).toBe('hold');
    expect(rec?.rationale).toContain(
      'Load held flat at 100 lb with 100% completion — maintain load and push rep ceiling before adding weight.',
    );
    expect(rec?.rationale).not.toContain('progress load next meso');
  });
});
