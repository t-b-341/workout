import { describe, expect, it } from 'vitest';
import { PRESCRIPTIONS } from '../src/lib/seed';

describe('U3 mini prescriptions', () => {
  it('lists bench, OHP, and Pendlay row for Friday mini upper', () => {
    const u3 = PRESCRIPTIONS.filter((p) => p.templateId === 'U3').sort((a, b) => a.order - b.order);
    expect(u3.map((p) => p.liftId)).toEqual(['bp', 'ohp', 'pendlay_row']);
    expect(u3.every((p) => p.repMin === 1 && p.repMax === 2)).toBe(true);
  });

  it('matches set counts when importCompletedSession omits reps', () => {
    const u3 = PRESCRIPTIONS.filter((p) => p.templateId === 'U3');
    for (const liftId of ['bp', 'ohp', 'pendlay_row'] as const) {
      expect(u3.find((p) => p.liftId === liftId)?.sets).toBe(2);
    }
  });
});
