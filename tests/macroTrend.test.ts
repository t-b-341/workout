import { describe, expect, it } from 'vitest';
import { buildMacroTrendAdvice, priorDatesExclusive, type DayFuel } from '@/lib/macroTrend';
import type { HydrationLog, NutritionLog } from '@/lib/types';

describe('priorDatesExclusive', () => {
  it('returns yesterday-first list excluding end date', () => {
    const d = priorDatesExclusive('2026-04-28', 3);
    expect(d[0]).toBe('2026-04-27');
    expect(d[1]).toBe('2026-04-26');
    expect(d[2]).toBe('2026-04-25');
  });
});

function n(
  date: string,
  pAct: number,
  pTgt: number,
  cAct: number,
  cTgt: number,
): NutritionLog {
  return {
    id: `nutrition-${date}`,
    date,
    caloriesTarget: cTgt,
    caloriesActual: cAct,
    proteinTargetG: pTgt,
    proteinActualG: pAct,
    carbsTargetG: 200,
    carbsActualG: 200,
    fatTargetG: 70,
    fatActualG: 70,
    mealsLoggedCount: 3,
  };
}

function h(date: string, act: number, tgt: number): HydrationLog {
  return {
    id: `hydration-${date}`,
    date,
    waterTargetMl: tgt,
    waterActualMl: act,
    electrolytes: false,
  };
}

describe('buildMacroTrendAdvice', () => {
  it('returns empty when too few nutrition days', () => {
    const days: DayFuel[] = [
      { date: 'a', nutrition: n('a', 100, 180, 2000, 2500) },
      { date: 'b', nutrition: n('b', 100, 180, 2000, 2500) },
    ];
    expect(buildMacroTrendAdvice(days).lines).toEqual([]);
  });

  it('flags sustained low protein', () => {
    const days: DayFuel[] = [
      { date: '1', nutrition: n('1', 60, 180, 2200, 2500) },
      { date: '2', nutrition: n('2', 70, 180, 2200, 2500) },
      { date: '3', nutrition: n('3', 65, 180, 2200, 2500) },
    ];
    const { lines } = buildMacroTrendAdvice(days);
    expect(lines.some((l) => l.includes('Protein'))).toBe(true);
  });

  it('flags sustained low hydration', () => {
    const days: DayFuel[] = [
      { date: '1', hydration: h('1', 1000, 3800) },
      { date: '2', hydration: h('2', 1200, 3800) },
      { date: '3', hydration: h('3', 900, 3800) },
    ];
    const { lines } = buildMacroTrendAdvice(days);
    expect(lines.some((l) => l.includes('Hydration'))).toBe(true);
  });
});
