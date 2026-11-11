import { describe, expect, it } from 'vitest';
import {
  DELOAD_ACCESSORY_LIFT_IDS,
  applyStandardDeload,
  deloadVolumeGroup,
} from '../src/lib/deload';
import type { Lift, Prescription, TemplateId } from '../src/lib/types';

function lift(overrides: Partial<Lift> & Pick<Lift, 'id'>): Lift {
  return {
    name: overrides.id,
    equipment: 'barbell',
    loadUnit: 'lb',
    repUnit: 'reps',
    increment: 5,
    ...overrides,
  };
}

function rx(o: Partial<Prescription>): Prescription {
  return {
    id: 'x',
    templateId: 'U1' as TemplateId,
    liftId: o.liftId ?? 'bp',
    order: 1,
    weight: o.weight ?? 100,
    sets: o.sets ?? 3,
    repMin: o.repMin ?? 5,
    repMax: o.repMax ?? 8,
    ...o,
  };
}

describe('deloadVolumeGroup', () => {
  it('classifies seeded accessory lifts', () => {
    expect(DELOAD_ACCESSORY_LIFT_IDS.has('jm_press')).toBe(true);
    expect(deloadVolumeGroup(lift({ id: 'pec_flyes' }))).toBe('accessory');
    expect(deloadVolumeGroup(lift({ id: 'bp' }))).toBe('main');
  });
});

describe('applyStandardDeload', () => {
  it('main: scales load only (~85%), keeps sets and reps', () => {
    const p = rx({ liftId: 'bp', weight: 200, sets: 3, repMin: 5, repMax: 8 });
    const out = applyStandardDeload(p, lift({ id: 'bp', equipment: 'barbell', loadUnit: 'lb' }));
    expect(out.weight).toBe(170);
    expect(out.sets).toBe(3);
    expect(out.repMin).toBe(5);
    expect(out.repMax).toBe(8);
  });

  it('accessory weighted: halves sets (rounded) and scales load', () => {
    const p = rx({ liftId: 'jm_press', weight: 100, sets: 5, repMin: 8, repMax: 12 });
    const out = applyStandardDeload(p, lift({ id: 'jm_press', loadUnit: 'lb', equipment: 'dumbbell' }));
    expect(out.weight).toBe(85);
    expect(out.sets).toBe(3);
    expect(out.repMin).toBe(8);
    expect(out.repMax).toBe(12);
  });

  it('LISS: halves duration minutes with at least ~5 minute floor when needed', () => {
    const p = rx({
      liftId: 'liss',
      weight: 0,
      sets: 1,
      repMin: 30,
      repMax: 30,
    });
    const out = applyStandardDeload(
      p,
      lift({ id: 'liss', equipment: 'cardio', loadUnit: 'none', repUnit: 'minutes' }),
    );
    expect(out.sets).toBe(1);
    expect(out.repMin).toBe(15);
    expect(out.repMax).toBe(15);
    const tiny = applyStandardDeload(
      rx({ ...p, liftId: 'liss', repMin: 8, repMax: 8 }),
      lift({ id: 'liss', equipment: 'cardio', loadUnit: 'none', repUnit: 'minutes' }),
    );
    expect(tiny.repMin).toBe(5);
  });

  it('Echo intervals: halves round counts, not mistaken for LISS', () => {
    const p = rx({ liftId: 'echo_intervals', weight: 0, sets: 1, repMin: 16, repMax: 16 });
    const out = applyStandardDeload(
      p,
      lift({
        id: 'echo_intervals',
        equipment: 'cardio',
        loadUnit: 'none',
        repUnit: 'minutes',
      }),
    );
    expect(out.repMin).toBe(8);
    expect(out.repMax).toBe(8);
  });

  it('multi-set planks: half sets only', () => {
    const p = rx({ liftId: 'planks', weight: 0, sets: 3, repMin: 45, repMax: 45 });
    const out = applyStandardDeload(
      p,
      lift({ id: 'planks', equipment: 'bodyweight', loadUnit: 'none', repUnit: 'seconds' }),
    );
    expect(out.sets).toBe(2);
    expect(out.repMin).toBe(45);
    expect(out.repMax).toBe(45);
  });

  it('single-set planks: halves hold roughly', () => {
    const p = rx({ liftId: 'planks', weight: 0, sets: 1, repMin: 60, repMax: 60 });
    const out = applyStandardDeload(
      p,
      lift({ id: 'planks', equipment: 'bodyweight', loadUnit: 'none', repUnit: 'seconds' }),
    );
    expect(out.sets).toBe(1);
    expect(out.repMin).toBe(30);
    expect(out.repMax).toBe(30);
  });

  it('uses recent working weight when provided', () => {
    const p = rx({ liftId: 'bp', weight: 405, sets: 3, repMin: 5, repMax: 8 });
    const out = applyStandardDeload(
      p,
      lift({ id: 'bp', equipment: 'barbell', loadUnit: 'lb' }),
      380,
    );
    expect(out.weight).toBe(323);
  });

  it('negative counterweight scales with ~85% on main lifts', () => {
    const out = applyStandardDeload(rx({ liftId: 'p1_assisted', weight: -10 }), lift({ id: 'p1_assisted', loadUnit: 'lb' }));
    expect(out.weight).toBe(-8);
    expect(out.sets).toBe(3);
  });
});
