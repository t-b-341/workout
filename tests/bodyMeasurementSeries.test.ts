import { describe, expect, it } from 'vitest';
import { bodyMeasurementSeries } from '@/lib/stats';
import type { BodyMeasurementLog } from '@/lib/types';

describe('bodyMeasurementSeries', () => {
  it('sorts by date and computes rolling averages over last up to four entries', () => {
    const logs: BodyMeasurementLog[] = [
      { id: '1', date: '2026-02-01', waist: 32, abdomen: 34, hips: 38 },
      { id: '2', date: '2026-01-15', waist: 33, abdomen: 35, hips: 39 },
    ];
    const pts = bodyMeasurementSeries(logs);
    expect(pts).toHaveLength(2);
    expect(pts[0].date).toBe('2026-01-15');
    expect(pts[1].date).toBe('2026-02-01');
    expect(pts[0].rollingWaist4w).toBe(33);
    expect(pts[1].rollingWaist4w).toBe((33 + 32) / 2);
    expect(pts[1].waist).toBe(32);
  });
});
