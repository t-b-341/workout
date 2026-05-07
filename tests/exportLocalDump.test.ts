import { describe, expect, it } from 'vitest';
import { buildExportSchemaDocumentation } from '@/lib/exportModelSchema';
import { computeExportSummary } from '@/lib/exportSummary';
import { DEFAULT_PROGRAM_TARGETS_STORED, programTargetToExportRow } from '@/lib/programExportTargets';
import type { Lift, ReadinessLog, SessionLog, SetLog, BodyweightLog } from '@/lib/types';
import { defaultMesoConfig } from '@/lib/mesocycle';

describe('buildExportSchemaDocumentation', () => {
  it('lists set_logs with intent + date and session_logs with sessionType', () => {
    const doc = buildExportSchemaDocumentation();
    expect(doc.set_logs?.fields.intent).toContain('max_test');
    expect(doc.set_logs?.fields.date).toContain('YYYY-MM-DD');
    expect(doc.session_logs?.fields.sessionType).toContain('abbreviated');
    expect(doc.nutrition_logs?.fields.dayType).toContain('liss');
    expect(doc.fitness_goals?.fields.metric).toContain('null');
    expect(doc.summary?.fields.sessionCount).toBe('number');
    expect(doc.summary?.fields['programTargets[].metric']).toContain('1rm');
  });
});

describe('computeExportSummary', () => {
  it('counts volume and max_test prFlags', () => {
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
    const session_logs: SessionLog[] = [
      {
        id: 's1',
        date: '2026-05-01',
        templateId: 'U1',
        mode: 'standard',
        deload: false,
        watchFlags: [],
      },
    ];
    const set_logs: SetLog[] = [
      {
        id: 'x1',
        sessionLogId: 's1',
        liftId: 'squat',
        prescriptionId: 'p1',
        setIndex: 0,
        intent: 'working',
        weight: 100,
        reps: 5,
        status: 'completed',
      },
      {
        id: 'x2',
        sessionLogId: 's1',
        liftId: 'squat',
        prescriptionId: 'p1',
        setIndex: 1,
        intent: 'max_test',
        weight: 120,
        reps: 3,
        status: 'completed',
      },
    ];
    const readiness_logs: ReadinessLog[] = [];
    const bodyweight_logs: BodyweightLog[] = [];

    const summary = computeExportSummary({
      exportedAtIso: '2026-05-07T00:00:00.000Z',
      session_logs,
      set_logs,
      lifts,
      readiness_logs,
      bodyweight_logs,
      extraDates: [],
      mesoConfig: defaultMesoConfig('2026-05-07'),
      programTargets: DEFAULT_PROGRAM_TARGETS_STORED.map(programTargetToExportRow),
    });

    expect(summary.sessionCount).toBe(1);
    expect(summary.totalSets).toBe(2);
    expect(summary.totalVolumeLbReps).toBe(100 * 5 + 120 * 3);
    expect(summary.prFlags).toEqual([{ liftId: 'squat', weight: 120, date: '2026-05-01' }]);
    expect(summary.programTargets.length).toBe(21);
    expect(summary.programTargets.find((x) => x.id === 'dl')).toEqual({
      id: 'dl',
      label: 'DL',
      text: expect.stringContaining('450'),
      metric: '1rm',
      targetValue: 450,
      targetReps: null,
      targetSets: null,
      currentValue: 435,
      unit: 'lb',
      liftId: 'dl',
    });
  });
});
