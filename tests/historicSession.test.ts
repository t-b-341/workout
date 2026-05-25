import { describe, expect, it } from 'vitest';
import { durationMinFromTimes, isoFromDateAndTime } from '@/lib/historicSession';

describe('historicSession', () => {
  it('computes local ISO timestamps and duration from date/time inputs', () => {
    const iso = isoFromDateAndTime('2026-05-20', '20:15');
    const t = new Date(iso);
    expect(t.getFullYear()).toBe(2026);
    expect(t.getMonth()).toBe(4);
    expect(t.getDate()).toBe(20);
    expect(t.getHours()).toBe(20);
    expect(t.getMinutes()).toBe(15);
    expect(durationMinFromTimes('2026-05-20', '20:15', '20:30')).toBe(15);
  });
});
