import { describe, expect, it } from 'vitest';
import { applyEffortScale, effortLabel } from '../src/lib/effort';
import type { Prescription, SessionLog, TemplateId } from '../src/lib/types';

function makePrescription(overrides: Partial<Prescription> = {}): Prescription {
  return {
    id: 'U1-bp',
    templateId: 'U1' as TemplateId,
    liftId: 'bp',
    order: 1,
    weight: 200,
    sets: 3,
    repMin: 5,
    repMax: 8,
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionLog> = {}): SessionLog {
  return {
    id: '2026-04-27-U1',
    date: '2026-04-27',
    templateId: 'U1' as TemplateId,
    mode: 'standard',
    deload: false,
    watchFlags: [],
    effortScale: 0,
    ...overrides,
  };
}

describe('effortLabel', () => {
  it('maps scale to readable labels', () => {
    expect(effortLabel(-1)).toBe('Easier');
    expect(effortLabel(0)).toBe('Normal');
    expect(effortLabel(1)).toBe('Harder');
  });
});

describe('applyEffortScale', () => {
  it('keeps prescription unchanged for normal effort', () => {
    const p = makePrescription();
    const s = makeSession({ effortScale: 0 });
    expect(applyEffortScale(p, s)).toEqual(p);
  });

  it('reduces load and sets for easier days', () => {
    const p = makePrescription({ weight: 205, sets: 3 });
    const s = makeSession({ effortScale: -1 });
    const out = applyEffortScale(p, s);
    expect(out.weight).toBe(185);
    expect(out.sets).toBe(2);
  });

  it('increases load and sets for harder days', () => {
    const p = makePrescription({ weight: 200, sets: 3 });
    const s = makeSession({ effortScale: 1 });
    const out = applyEffortScale(p, s);
    expect(out.weight).toBe(210);
    expect(out.sets).toBe(4);
  });

  it('never reduces sets below 1', () => {
    const p = makePrescription({ sets: 1 });
    const s = makeSession({ effortScale: -1 });
    const out = applyEffortScale(p, s);
    expect(out.sets).toBe(1);
  });
});
