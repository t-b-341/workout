import { describe, expect, it } from 'vitest';
import {
  buildRoutineMarkdown,
  isoDatesEndingToday,
  PROGRESSION_RULES_MARKDOWN,
} from '@/lib/exportRoutineMarkdown';
import type {
  Lift,
  NutritionLog,
  Prescription,
  SessionTemplate,
  SleepLog,
  StressLog,
} from '@/lib/types';

const lifts: Lift[] = [
  {
    id: 'bp',
    name: 'Bench Press',
    equipment: 'barbell',
    loadUnit: 'lb',
    repUnit: 'reps',
    increment: 5,
  },
  {
    id: 'pec_flyes',
    name: 'Pec Flyes',
    equipment: 'dumbbell',
    loadUnit: 'lb',
    repUnit: 'reps',
    increment: 2.5,
  },
];

const templates: SessionTemplate[] = [
  {
    id: 'U1',
    name: 'Monday — Upper (Heavy)',
    dayOfWeek: 1,
    group: 'upper',
    intensity: 'heavy',
  },
];

const prescriptions: Prescription[] = [
  {
    id: 'U1-bp',
    templateId: 'U1',
    liftId: 'bp',
    order: 10,
    weight: 175,
    sets: 3,
    repMin: 4,
    repMax: 8,
  },
  {
    id: 'U1-pec',
    templateId: 'U1',
    liftId: 'pec_flyes',
    order: 20,
    weight: 17.5,
    sets: 3,
    repMin: 12,
    repMax: 15,
    perSide: true,
  },
];

describe('exportRoutineMarkdown', () => {
  it('includes progression rules block', () => {
    expect(PROGRESSION_RULES_MARKDOWN).toContain('Double progression');
    expect(PROGRESSION_RULES_MARKDOWN).toContain('p1_assisted');
  });

  it('lists dumbbell constraint and flags DB prescriptions', () => {
    const md = buildRoutineMarkdown({
      exportedAtIso: '2026-05-01T12:00:00.000Z',
      templates,
      lifts,
      prescriptions,
      nutritionByDate: new Map(),
      sleepByDate: new Map(),
      stressByDate: new Map(),
      signalDates: ['2026-05-01'],
    });
    expect(md).toContain('**No dumbbells.**');
    expect(md).toContain('Pec Flyes');
    expect(md).toContain('⚠️ DB');
    expect(md).toContain('Bench Press');
    expect(md).toContain('### U1 — Monday');
  });

  it('fills nutrition sleep stress tables when maps have rows', () => {
    const nutrition: NutritionLog = {
      id: 'n1',
      date: '2026-05-01',
      caloriesTarget: 3000,
      caloriesActual: 2800,
      proteinTargetG: 200,
      proteinActualG: 190,
      carbsTargetG: 300,
      carbsActualG: 280,
      fatTargetG: 90,
      fatActualG: 85,
      mealsLoggedCount: 3,
    };
    const sleep: SleepLog = {
      id: 's1',
      date: '2026-05-01',
      sleepHours: 8,
      sleepQuality: 4,
    };
    const stress: StressLog = {
      id: 'st1',
      date: '2026-05-01',
      startOfDay: 2,
      midDay: 3,
      endOfDay: 2,
      average: 2.33,
      managementEffectiveness: 4,
    };
    const md = buildRoutineMarkdown({
      exportedAtIso: '2026-05-01T12:00:00.000Z',
      templates,
      lifts,
      prescriptions,
      nutritionByDate: new Map([['2026-05-01', nutrition]]),
      sleepByDate: new Map([['2026-05-01', sleep]]),
      stressByDate: new Map([['2026-05-01', stress]]),
      signalDates: ['2026-05-01'],
    });
    expect(md).toContain('2800/3000');
    expect(md).toContain('| 8 | 4 |');
    expect(md).toContain('2.3');
  });

  it('isoDatesEndingToday returns chronological ISO dates', () => {
    const dates = isoDatesEndingToday(3, new Date('2026-05-03T12:00:00'));
    expect(dates).toEqual(['2026-05-01', '2026-05-02', '2026-05-03']);
  });
});
