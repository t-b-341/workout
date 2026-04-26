import { describe, expect, it } from 'vitest';
import { TEMPLATES, defaultTemplateForLocalDate } from '@/lib/seed';

/** Local calendar date at noon (avoid UTC `YYYY-MM-DD` parse shifting weekday). */
function localNoon(y: number, m0: number, d: number) {
  return new Date(y, m0, d, 12, 0, 0);
}

describe('defaultTemplateForLocalDate', () => {
  it('maps Monday to U1 (dayOfWeek 1 === getDay 1)', () => {
    expect(defaultTemplateForLocalDate(TEMPLATES, localNoon(2026, 3, 27)).id).toBe('U1');
  });
  it('maps Tuesday to L1', () => {
    expect(defaultTemplateForLocalDate(TEMPLATES, localNoon(2026, 3, 28)).id).toBe('L1');
  });
  it('maps Saturday to L3', () => {
    expect(defaultTemplateForLocalDate(TEMPLATES, localNoon(2026, 4, 2)).id).toBe('L3');
  });
  it('maps Sunday to next Monday (U1), not templates[0] fallback', () => {
    expect(defaultTemplateForLocalDate(TEMPLATES, localNoon(2026, 3, 26)).id).toBe('U1');
  });
});
