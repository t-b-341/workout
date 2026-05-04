import { describe, expect, it } from 'vitest';
import {
  anchorMonday,
  blockDateRangeForMesoIndex,
  blockStartMondayForMesoIndex,
  mesocyclePosition,
  weeksSinceAnchorMonday,
} from '../src/lib/mesocycle';
import type { MesocycleConfig } from '../src/lib/mesocycle';

describe('mesocycle block boundaries', () => {
  const cfg: MesocycleConfig = {
    startDate: '2026-01-05',
    accumulation: 4,
    deload: 1,
  };

  it('normalizes anchor to ISO Monday', () => {
    expect(anchorMonday(cfg)).toBe('2026-01-05');
  });

  it('block 1 covers five ISO weeks Monday→Sunday inclusive', () => {
    const r = blockDateRangeForMesoIndex(cfg, 1);
    expect(r).toEqual({ fromIso: '2026-01-05', toIso: '2026-02-08' });
  });

  it('block 2 starts the Monday after block 1 ends', () => {
    expect(blockStartMondayForMesoIndex(cfg, 2)).toBe('2026-02-09');
    expect(blockDateRangeForMesoIndex(cfg, 2)?.fromIso).toBe('2026-02-09');
    expect(blockDateRangeForMesoIndex(cfg, 2)?.toIso).toBe('2026-03-15');
  });

  it('rejects invalid meso index', () => {
    expect(blockStartMondayForMesoIndex(cfg, 0)).toBeNull();
    expect(blockDateRangeForMesoIndex(cfg, 0)).toBeNull();
  });

  it('mesocyclePosition agrees with block ranges for boundary dates', () => {
    expect(mesocyclePosition('2026-01-05', cfg)).toMatchObject({
      mesoIndex: 1,
      weekInMeso: 1,
      totalWeeks: 5,
      isDeload: false,
    });
    expect(mesocyclePosition('2026-02-08', cfg)).toMatchObject({
      mesoIndex: 1,
      weekInMeso: 5,
      isDeload: true,
    });
    expect(mesocyclePosition('2026-02-09', cfg)).toMatchObject({
      mesoIndex: 2,
      weekInMeso: 1,
      isDeload: false,
    });
  });

  it('mid-week dates snap to same meso as their ISO week Monday', () => {
    expect(mesocyclePosition('2026-01-07', cfg)).toMatchObject({ mesoIndex: 1, weekInMeso: 1 });
    expect(mesocyclePosition('2026-02-11', cfg)).toMatchObject({ mesoIndex: 2, weekInMeso: 1 });
  });

  it('weeksSinceAnchorMonday matches position decomposition', () => {
    const d = '2026-02-11';
    const w = weeksSinceAnchorMonday(d, cfg);
    expect(w).toBe(5);
    const pos = mesocyclePosition(d, cfg);
    expect(pos?.mesoIndex).toBe(Math.floor(w! / 5) + 1);
    expect(pos?.weekInMeso).toBe((w! % 5) + 1);
  });

  it('returns null before anchor week', () => {
    expect(weeksSinceAnchorMonday('2026-01-04', cfg)).toBeNull();
    expect(mesocyclePosition('2026-01-04', cfg)).toBeNull();
  });
});
