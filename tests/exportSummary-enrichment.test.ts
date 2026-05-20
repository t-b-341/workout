import { describe, expect, it } from 'vitest';
import {
  computeProgramTargetCurrentFromLogs,
  enrichProgramTargetsAtExport,
} from '@/lib/exportSummary';
import type { MindfulnessLog, Prescription, SetLog } from '@/lib/types';
import type { SummaryProgramTarget } from '@/lib/programExportTargets';

function pt(partial: Partial<SummaryProgramTarget> & Pick<SummaryProgramTarget, 'id' | 'metric' | 'liftId'>): SummaryProgramTarget {
  return {
    label: partial.label ?? partial.id,
    text: partial.text ?? '',
    targetValue: partial.targetValue ?? null,
    targetReps: partial.targetReps ?? null,
    targetSets: partial.targetSets ?? null,
    currentValue: partial.currentValue ?? null,
    currentValueSource: partial.currentValueSource ?? null,
    unit: partial.unit ?? 'lb',
    ...partial,
  };
}

describe('enrichProgramTargetsAtExport', () => {
  it('computes 1rm from max_test, else singles', () => {
    const row = pt({
      id: 'dl',
      metric: '1rm',
      liftId: 'dl',
      label: 'DL',
      targetValue: 500,
      unit: 'lb',
    });
    const sets: SetLog[] = [
      {
        id: 'a',
        sessionLogId: 's1',
        liftId: 'dl',
        prescriptionId: 'rx-dl',
        setIndex: 0,
        intent: 'working',
        weight: 405,
        reps: 3,
        status: 'completed',
      },
      {
        id: 'b',
        sessionLogId: 's1',
        liftId: 'dl',
        prescriptionId: 'rx-dl',
        setIndex: 1,
        intent: 'max_test',
        weight: 455,
        reps: 2,
        status: 'completed',
      },
    ];
    const out = enrichProgramTargetsAtExport([row], sets, [], []);
    expect(out[0].currentValue).toBe(455);
    expect(out[0].currentValueSource).toBe('computed');
  });

  it('falls back to max weight at reps===1 when no max_test', () => {
    const row = pt({
      id: 'dl',
      metric: '1rm',
      liftId: 'dl',
      label: 'DL',
      unit: 'lb',
    });
    const sets: SetLog[] = [
      {
        id: 'a',
        sessionLogId: 's1',
        liftId: 'dl',
        prescriptionId: 'rx-dl',
        setIndex: 0,
        intent: 'working',
        weight: 315,
        reps: 1,
        status: 'completed',
      },
    ];
    const out = enrichProgramTargetsAtExport([row], sets, [], []);
    expect(out[0].currentValue).toBe(315);
    expect(out[0].currentValueSource).toBe('computed');
  });

  it('computes working_set with repMin from prescription', () => {
    const rx: Prescription = {
      id: 'rx-cgbp',
      templateId: 'U1',
      liftId: 'cgbp',
      order: 1,
      weight: 135,
      sets: 4,
      repMin: 10,
      repMax: 12,
    };
    const row = pt({
      id: 'cgbp',
      metric: 'working_set',
      liftId: 'cgbp',
      label: 'CGBP',
      unit: 'lb',
    });
    const sets: SetLog[] = [
      {
        id: 'w',
        sessionLogId: 's1',
        liftId: 'cgbp',
        prescriptionId: 'rx-cgbp',
        setIndex: 0,
        intent: 'working',
        weight: 155,
        reps: 10,
        status: 'completed',
      },
      {
        id: 'low',
        sessionLogId: 's1',
        liftId: 'cgbp',
        prescriptionId: 'rx-cgbp',
        setIndex: 1,
        intent: 'working',
        weight: 165,
        reps: 8,
        status: 'completed',
      },
    ];
    const out = enrichProgramTargetsAtExport([row], sets, [rx], []);
    expect(out[0].currentValue).toBe(155);
    expect(out[0].currentValueSource).toBe('computed');
  });

  it('computes reps from bodyweight sets (weight===0)', () => {
    const row = pt({
      id: 'p1_bw_reps',
      metric: 'reps',
      liftId: 'p1_bw',
      label: 'P1 BW',
      unit: 'reps',
    });
    const sets: SetLog[] = [
      {
        id: 'x',
        sessionLogId: 's1',
        liftId: 'p1_bw',
        prescriptionId: 'rx',
        setIndex: 0,
        intent: 'working',
        weight: 0,
        reps: 12,
        status: 'completed',
      },
    ];
    const out = enrichProgramTargetsAtExport([row], sets, [], []);
    expect(out[0].currentValue).toBe(12);
    expect(out[0].currentValueSource).toBe('computed');
  });

  it('computes duration_min from mindfulness_logs average', () => {
    const row = pt({
      id: 'mindfulness',
      metric: 'duration_min',
      liftId: null,
      label: 'Mindfulness',
      unit: 'min',
    });
    const logs: MindfulnessLog[] = [
      { id: 'm1', date: '2026-06-01', loggedAt: '2026-06-01T08:00:00Z', durationMin: 10 },
      { id: 'm2', date: '2026-06-01', loggedAt: '2026-06-01T09:00:00Z', durationMin: 20 },
    ];
    const out = enrichProgramTargetsAtExport([row], [], [], logs);
    expect(out[0].currentValue).toBe(15);
    expect(out[0].currentValueSource).toBe('computed');
  });

  it('does not overwrite manual currentValue', () => {
    const row = pt({
      id: 'dl',
      metric: '1rm',
      liftId: 'dl',
      label: 'DL',
      currentValue: 400,
      currentValueSource: 'manual',
      unit: 'lb',
    });
    const sets: SetLog[] = [
      {
        id: 'b',
        sessionLogId: 's1',
        liftId: 'dl',
        prescriptionId: 'rx',
        setIndex: 0,
        intent: 'max_test',
        weight: 500,
        reps: 1,
        status: 'completed',
      },
    ];
    const out = enrichProgramTargetsAtExport([row], sets, [], []);
    expect(out[0].currentValue).toBe(400);
    expect(out[0].currentValueSource).toBe('manual');
  });
});

describe('computeProgramTargetCurrentFromLogs', () => {
  it('returns null for unsupported metric', () => {
    const row = pt({
      id: 'bw',
      metric: 'bodyweight',
      liftId: null,
      label: 'BW',
      unit: 'lb',
    });
    expect(
      computeProgramTargetCurrentFromLogs(row, [], [], []),
    ).toBeNull();
  });
});
