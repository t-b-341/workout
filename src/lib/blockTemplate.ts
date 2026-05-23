import type { PhaseGoal, BlockTemplate } from './types';
import { todayIso } from './time';

/**
 * Generate the four standard phases for a 10-week
 * accumulation/deficit block from an anchor date.
 *
 * Week 1–4:  Accumulation + Deficit
 * Week 5–8:  Accumulation + Diet Maintenance
 * Week 9–10: Deload + Deficit
 */
export function buildTenWeekBlock(
  blockId: string,
  anchorDate: string,
  defaults: {
    caloriesDeficit: number;
    caloriesMaintenanceTraining: number;
    caloriesRest: number;
    proteinG: number;
  },
): BlockTemplate {
  const anchor = new Date(anchorDate);
  function addDays(d: Date, n: number): string {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r.toISOString().slice(0, 10);
  }

  const phases: Omit<PhaseGoal, 'active' | 'updatedAt'>[] = [
    {
      id: `${blockId}-p1`,
      label: 'Weeks 1–4 — Accumulation + Deficit',
      trainingMode: 'accumulation',
      nutritionMode: 'deficit',
      startDate: addDays(anchor, 0),
      endDate: addDays(anchor, 27),
      caloriesTraining: defaults.caloriesDeficit,
      caloriesRest: defaults.caloriesRest,
      proteinG: defaults.proteinG,
      notes: '',
    },
    {
      id: `${blockId}-p2`,
      label: 'Weeks 5–8 — Accumulation + Diet Maintenance',
      trainingMode: 'accumulation',
      nutritionMode: 'maintenance',
      startDate: addDays(anchor, 28),
      endDate: addDays(anchor, 55),
      caloriesTraining: defaults.caloriesMaintenanceTraining,
      caloriesRest: defaults.caloriesRest,
      proteinG: defaults.proteinG,
      notes: '',
    },
    {
      id: `${blockId}-p3`,
      label: 'Weeks 9–10 — Deload + Deficit',
      trainingMode: 'deload',
      nutritionMode: 'deficit',
      startDate: addDays(anchor, 56),
      endDate: addDays(anchor, 69),
      caloriesTraining: defaults.caloriesDeficit,
      caloriesRest: defaults.caloriesRest,
      proteinG: defaults.proteinG,
      notes:
        'Deload in deficit — recovery capacity is lower than '
        + 'a maintenance or surplus deload because the '
        + 'hormonal environment is suppressed (leptin down, '
        + 'testosterone reduced, cortisol elevated). '
        + 'Tradeoff is intentional: two weeks of deficit '
        + 'calories adds meaningful fat loss progress across '
        + 'multiple blocks. Compensate by being aggressive '
        + 'about sleep, hitting protein targets daily '
        + '(200g+ minimum), and keeping deload intensity at '
        + 'or below 85% of working weights. Do not push '
        + 'toward RPE 9–10 this week.',
    },
  ];

  const today = todayIso();
  return {
    id: blockId,
    label: `10-Week Block — starts ${anchorDate}`,
    anchorDate,
    totalWeeks: 10,
    phases: phases.map(p => ({
      ...p,
      active: p.startDate <= today && p.endDate >= today,
      updatedAt: new Date().toISOString(),
    })),
    updatedAt: new Date().toISOString(),
  };
}
