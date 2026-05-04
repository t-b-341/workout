import { describe, expect, it } from 'vitest';
import {
  buildHrvVariabilitySeries,
  DEFAULT_HRV_VAR_WINDOW,
  measuredHrvAsc,
} from '@/lib/hrvAnalytics';
import type { ReadinessLog } from '@/lib/types';

describe('buildHrvVariabilitySeries', () => {
  it('matches constant series: SD 0, CV 0', () => {
    const asc = [40, 40, 40].map((hrvRmssd, i) => ({
      date: `2026-01-0${i + 1}`,
      hrvRmssd,
    }));
    const s = buildHrvVariabilitySeries(asc, DEFAULT_HRV_VAR_WINDOW);
    expect(s).toHaveLength(3);
    expect(s[2]?.sdRmssd).toBe(0);
    expect(s[2]?.cvPct).toBe(0);
    expect(s[2]?.meanRmssd).toBe(40);
  });

  it('increases SD when values spread', () => {
    const asc = [
      { date: '2026-01-01', hrvRmssd: 30 },
      { date: '2026-01-02', hrvRmssd: 50 },
      { date: '2026-01-03', hrvRmssd: 70 },
    ];
    const s = buildHrvVariabilitySeries(asc, 3);
    const last = s[2]!;
    expect(last.meanRmssd).toBeCloseTo(50, 5);
    expect(last.sdRmssd).toBeGreaterThan(15);
    expect(last.cvPct).toBeGreaterThan(0);
  });
});

describe('measuredHrvAsc', () => {
  it('sorts by date and drops skips', () => {
    const logs: ReadinessLog[] = [
      {
        id: 'a',
        sessionLogId: 's1',
        date: '2026-02-02',
        sleepHours: 7,
        soreness: 2,
        motivation: 4,
        hrvRmssd: 45,
        hrvSkipped: false,
        createdAt: '2026-02-02T12:00:00.000Z',
      },
      {
        id: 'b',
        sessionLogId: 's2',
        date: '2026-02-01',
        sleepHours: 7,
        soreness: 2,
        motivation: 4,
        hrvSkipped: true,
        createdAt: '2026-02-01T12:00:00.000Z',
      },
    ];
    const m = measuredHrvAsc(logs);
    expect(m).toHaveLength(1);
    expect(m[0]?.date).toBe('2026-02-02');
    expect(m[0]?.hrvRmssd).toBe(45);
  });
});
