import { describe, expect, it } from 'vitest';
import { mesocyclePosition, type MesocycleConfig } from '../src/lib/mesocycle';
import { snapWorkingWeight, liftForSnap } from '../src/lib/progression';
import { buildScheduledWorkoutPreview } from '../src/lib/scheduleWorkoutPreview';
import type { Lift, Prescription } from '../src/lib/types';

const bpLift: Lift = {
  id: 'bp',
  name: 'Bench Press',
  equipment: 'barbell',
  loadUnit: 'lb',
  repUnit: 'reps',
  increment: 5,
};
const pecLift: Lift = {
  id: 'pec_flyes',
  name: 'Pec Flyes',
  equipment: 'dumbbell',
  loadUnit: 'lb',
  repUnit: 'reps',
  increment: 2.5,
};

function rx(templateId: 'U1', liftId: string, base: Partial<Prescription>): Prescription {
  return {
    id: `${liftId}-seed`,
    templateId,
    liftId,
    order: base.order ?? 1,
    weight: base.weight ?? 200,
    sets: base.sets ?? 3,
    repMin: base.repMin ?? 6,
    repMax: base.repMax ?? 8,
    ...base,
  };
}

describe('buildScheduledWorkoutPreview', () => {
  /** Monday 2026-01-05 — Meso · Week 1 (4 accumulation + 1 deload). */
  const cfg: MesocycleConfig = { startDate: '2026-01-05', accumulation: 4, deload: 1 };

  /** Deload week's Tuesday (Feb 2026 block). */
  const deloadTuesday = '2026-02-03';
  /** Accumulation week's Wednesday during week 1. */
  const accumulationWednesday = '2026-01-07';

  it('dates used in tests align with Meso accumulation vs deload', () => {
    expect(mesocyclePosition(accumulationWednesday, cfg)?.isDeload).toBe(false);
    expect(mesocyclePosition(deloadTuesday, cfg)?.isDeload).toBe(true);
  });

  it('uses flat prescribed loads when not a meso deload day', () => {
    const out = buildScheduledWorkoutPreview(
      accumulationWednesday,
      'U1',
      [rx('U1', 'bp', { weight: 205 })],
      [bpLift],
      cfg,
    );
    expect(out.isMesoDeloadDay).toBe(false);
    expect(out.rows[0].displayed.weight).toBe(snapWorkingWeight(205, liftForSnap('bp')));
    expect(out.rows[0].displayed.sets).toBe(3);
  });

  it('meso deload applies standard deload from current prescriptions, then snaps loads', () => {
    const out = buildScheduledWorkoutPreview(
      deloadTuesday,
      'U1',
      [
        rx('U1', 'bp', { weight: 205, order: 1 }),
        rx('U1', 'pec_flyes', { weight: 60, sets: 8, perSide: true, order: 2 }),
      ],
      [bpLift, pecLift],
      cfg,
    );
    expect(out.isMesoDeloadDay).toBe(true);
    const bpRow = out.rows.find((r) => r.lift.id === 'bp');
    const pecRow = out.rows.find((r) => r.lift.id === 'pec_flyes');
    const expectedBp = snapWorkingWeight(Math.round(205 * 0.85), liftForSnap('bp'));
    expect(bpRow!.displayed.weight).toBe(expectedBp);
    const expectedPec = snapWorkingWeight(Math.round(60 * 0.85), liftForSnap('pec_flyes'));
    expect(pecRow!.displayed.weight).toBe(expectedPec);
    expect(pecRow!.displayed.sets).toBe(4);
  });

  it('returns empty rows when lifts array is empty', () => {
    const out = buildScheduledWorkoutPreview(
      accumulationWednesday,
      'U1',
      [rx('U1', 'bp', { weight: 100 })],
      [],
      cfg,
    );
    expect(out.rows).toHaveLength(0);
  });
});
