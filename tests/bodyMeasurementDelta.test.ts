import { describe, expect, it } from 'vitest';
import { computeMesoAnalysis } from '@/lib/mesoAnalysis';
import { DEFAULT_PROGRAM_TARGETS_STORED, programTargetToExportRow } from '@/lib/programExportTargets';
import type { BodyMeasurementLog, Lift, SessionLog, SetLog } from '@/lib/types';

const squatLift: Lift = {
  id: 'squat',
  name: 'Squat',
  equipment: 'barbell',
  loadUnit: 'lb',
  repUnit: 'reps',
  increment: 5,
};

const minimalSession: SessionLog = {
  id: 'real',
  date: '2026-05-02',
  templateId: 'U1',
  mode: 'standard',
  deload: false,
  watchFlags: [],
};

const minimalSet: SetLog = {
  id: 'one',
  sessionLogId: 'real',
  liftId: 'squat',
  prescriptionId: 'p1',
  setIndex: 0,
  intent: 'working',
  weight: 100,
  reps: 5,
  status: 'completed',
};

const prescriptions = [
  { id: 'p1', templateId: 'U1' as const, liftId: 'squat', sets: 4, repMin: 5, repMax: 5, weight: 100 },
];

const baseMesoArgs = {
  exportedAtIso: '2026-05-07T12:00:00.000Z',
  session_logs: [minimalSession],
  set_logs: [minimalSet],
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
  mesoStartDate: '2026-05-01',
  mesoEndDate: '2026-05-07',
};

describe('bodyMeasurementDelta', () => {
  it('reports deltas only when all rows share the same non-null protocol and count ≥ 2', () => {
    const body_measurement_logs: BodyMeasurementLog[] = [
      {
        id: 'a',
        date: '2026-05-02',
        waist: 34,
        abdomen: 36,
        hips: 38,
        protocol: 'morning fasted',
        timeOfDay: 'morning',
      },
      {
        id: 'b',
        date: '2026-05-06',
        waist: 33.5,
        abdomen: 35.5,
        hips: 37.5,
        protocol: 'morning fasted',
        timeOfDay: 'morning',
      },
    ];

    const report = computeMesoAnalysis({
      ...baseMesoArgs,
      body_measurement_logs,
    });

    expect(report.bodyMeasurementDelta?.protocolConsistent).toBe(true);
    expect(report.bodyMeasurementDelta?.protocol).toBe('morning fasted');
    expect(report.bodyMeasurementDelta?.waistDeltaIn).toBe(-0.5);
    expect(report.bodyMeasurementDelta?.abdomenDeltaIn).toBe(-0.5);
    expect(report.bodyMeasurementDelta?.hipsDeltaIn).toBe(-0.5);
    expect(report.bodyMeasurementDelta?.reliabilityNote).toBeNull();
  });

  it('withholds deltas when protocols differ', () => {
    const body_measurement_logs: BodyMeasurementLog[] = [
      {
        id: 'a',
        date: '2026-05-02',
        waist: 34,
        abdomen: 36,
        hips: 38,
        protocol: 'A',
      },
      {
        id: 'b',
        date: '2026-05-06',
        waist: 33,
        abdomen: 35,
        hips: 37,
        protocol: 'B',
      },
    ];

    const report = computeMesoAnalysis({
      ...baseMesoArgs,
      body_measurement_logs,
    });

    expect(report.bodyMeasurementDelta?.protocolConsistent).toBe(false);
    expect(report.bodyMeasurementDelta?.waistDeltaIn).toBeNull();
    expect(report.bodyMeasurementDelta?.reliabilityNote).toContain('protocol');
  });

  it('withholds deltas when any protocol is missing', () => {
    const body_measurement_logs: BodyMeasurementLog[] = [
      {
        id: 'a',
        date: '2026-05-02',
        waist: 34,
        abdomen: 36,
        hips: 38,
        protocol: 'same',
      },
      {
        id: 'b',
        date: '2026-05-06',
        waist: 33,
        abdomen: 35,
        hips: 37,
      },
    ];

    const report = computeMesoAnalysis({
      ...baseMesoArgs,
      body_measurement_logs,
    });

    expect(report.bodyMeasurementDelta?.protocolConsistent).toBe(false);
    expect(report.bodyMeasurementDelta?.waistDeltaIn).toBeNull();
  });
});
