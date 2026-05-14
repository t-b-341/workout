import { describe, expect, it } from 'vitest';
import {
  decideProgression,
  snapBarbell,
  snapDbLoad,
  snapWorkingWeight,
  liftForSnap,
} from '../src/lib/progression';
import type {
  Prescription,
  SessionLog,
  SetLog,
  SetStatus,
  TemplateId,
} from '../src/lib/types';

const SESSION_ID = '2026-04-21-U1';
const PRESCRIPTION_ID = 'U1-bp';

function makeSession(overrides: Partial<SessionLog> = {}): SessionLog {
  return {
    id: SESSION_ID,
    date: '2026-04-21',
    templateId: 'U1' as TemplateId,
    mode: 'standard',
    deload: false,
    watchFlags: [],
    ...overrides,
  };
}

function makePrescription(overrides: Partial<Prescription> = {}): Prescription {
  return {
    id: PRESCRIPTION_ID,
    templateId: 'U1' as TemplateId,
    liftId: 'bp',
    order: 40,
    weight: 175,
    sets: 3,
    repMin: 4,
    repMax: 8,
    ...overrides,
  };
}

function makeSets(
  count: number,
  reps: number,
  status: SetStatus = 'completed',
  overrides: Partial<SetLog> = {},
): SetLog[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${SESSION_ID}-${PRESCRIPTION_ID}-${i}-X`,
    sessionLogId: SESSION_ID,
    liftId: 'bp',
    prescriptionId: PRESCRIPTION_ID,
    setIndex: i,
    weight: 175,
    reps,
    status,
    ...overrides,
  }));
}

describe('decideProgression — standard mode', () => {
  it('advances by lift increment when every set hits repMax', () => {
    const dec = decideProgression(makePrescription(), makeSets(3, 8), makeSession());
    expect(dec.advanced).toBe(true);
    expect(dec.held).toBe(false);
    expect(dec.skipped).toBe(false);
    expect(dec.nextWeight).toBe(180);
    expect(dec.reason).toMatch(/All sets hit 8 reps/);
  });

  it('does not advance weight when lift has lockedWeight (rear delt plate flyes)', () => {
    const presc = makePrescription({
      id: 'U3-rdf',
      templateId: 'U3' as TemplateId,
      liftId: 'rdf',
      order: 99,
      weight: 10,
      sets: 3,
      repMin: 15,
      repMax: 15,
    });
    const sets: SetLog[] = Array.from({ length: 3 }, (_, i) => ({
      id: `${SESSION_ID}-rdf-${i}-X`,
      sessionLogId: SESSION_ID,
      liftId: 'rdf',
      prescriptionId: presc.id,
      setIndex: i,
      weight: 10,
      reps: 15,
      status: 'completed' as const,
    }));
    const dec = decideProgression(presc, sets, makeSession());
    expect(dec.advanced).toBe(false);
    expect(dec.nextWeight).toBe(10);
    expect(dec.reason).toMatch(/locked/i);
  });

  it('uses prescription.increment when provided', () => {
    const dec = decideProgression(
      makePrescription({ increment: 2.5 }),
      makeSets(3, 8),
      makeSession(),
    );
    expect(dec.nextWeight).toBe(180);
  });

  it('uses liftIncrementOverride when prescription has none', () => {
    const dec = decideProgression(
      makePrescription(),
      makeSets(3, 8),
      makeSession(),
      2.5,
    );
    expect(dec.nextWeight).toBe(180);
  });

  it('falls back to +5 when neither override is provided', () => {
    const dec = decideProgression(makePrescription(), makeSets(3, 8), makeSession());
    expect(dec.nextWeight).toBe(180);
  });

  it('holds when one set is below repMax', () => {
    const sets = [...makeSets(2, 8), ...makeSets(1, 7)];
    sets[2].setIndex = 2;
    const dec = decideProgression(makePrescription(), sets, makeSession());
    expect(dec.held).toBe(true);
    expect(dec.advanced).toBe(false);
    expect(dec.nextWeight).toBe(175);
    expect(dec.reason).toMatch(/7 reps < top of range/);
  });

  it('holds when fewer sets are logged than expected', () => {
    const dec = decideProgression(
      makePrescription(),
      makeSets(2, 8),
      makeSession(),
    );
    expect(dec.held).toBe(true);
    expect(dec.reason).toMatch(/Only 2\/3 sets logged/);
  });

  it.each<SetStatus>(['reduced', 'skipped', 'substituted'])(
    'holds when any set status is %s even at top of range',
    (status) => {
      const sets = makeSets(3, 8);
      sets[1].status = status;
      const dec = decideProgression(makePrescription(), sets, makeSession());
      expect(dec.held).toBe(true);
      expect(dec.reason).toMatch(new RegExp(status));
    },
  );

  it('skips when no sets are logged', () => {
    const dec = decideProgression(makePrescription(), [], makeSession());
    expect(dec.skipped).toBe(true);
    expect(dec.reason).toBe('No sets logged');
  });
});

describe('decideProgression — non-standard sessions', () => {
  it('skips on light mode even when sets hit repMax', () => {
    const dec = decideProgression(
      makePrescription(),
      makeSets(3, 8),
      makeSession({ mode: 'light' }),
    );
    expect(dec.skipped).toBe(true);
    expect(dec.advanced).toBe(false);
  });

  it('skips on skip mode', () => {
    const dec = decideProgression(
      makePrescription(),
      makeSets(3, 8),
      makeSession({ mode: 'skip' }),
    );
    expect(dec.skipped).toBe(true);
  });

  it('skips when deload is on, even on a standard session', () => {
    const dec = decideProgression(
      makePrescription(),
      makeSets(3, 8),
      makeSession({ deload: true }),
    );
    expect(dec.skipped).toBe(true);
    expect(dec.reason).toMatch(/Light \/ skip \/ deload/);
  });
});

describe('decideProgression — per-side lifts', () => {
  function makePerSideSets(reps: number, sides: Array<'L' | 'R'>): SetLog[] {
    return sides.flatMap((side, i) => ({
      id: `${SESSION_ID}-${PRESCRIPTION_ID}-${Math.floor(i / 2)}-${side}`,
      sessionLogId: SESSION_ID,
      liftId: 'per_side_probe',
      prescriptionId: PRESCRIPTION_ID,
      setIndex: Math.floor(i / 2),
      weight: 22.5,
      reps,
      status: 'completed' as SetStatus,
      side,
    }));
  }

  const presc = makePrescription({
    liftId: 'per_side_probe',
    weight: 22.5,
    sets: 2,
    repMin: 6,
    repMax: 8,
    perSide: true,
    increment: 2.5,
  });

  it('advances when both sides hit repMax across all setIndexes', () => {
    const sets = makePerSideSets(8, ['L', 'R', 'L', 'R']);
    const dec = decideProgression(presc, sets, makeSession());
    expect(dec.advanced).toBe(true);
    expect(dec.nextWeight).toBe(25);
  });

  it('holds when one side is short of repMax', () => {
    const sets = makePerSideSets(8, ['L', 'R', 'L', 'R']);
    sets[3].reps = 7;
    const dec = decideProgression(presc, sets, makeSession());
    expect(dec.held).toBe(true);
  });

  it('holds when only one side is logged for a setIndex', () => {
    // grouping is by setIndex; if both sides are missing for one of the
    // expected sets the by-index map size will be < expectedSets
    const sets = makePerSideSets(8, ['L', 'R']);
    const dec = decideProgression(presc, sets, makeSession());
    expect(dec.held).toBe(true);
    expect(dec.reason).toMatch(/Only 1\/2 sets logged/);
  });
});

describe('decideProgression — p1 assisted', () => {
  const PRESC_ID = 'U2-p1_assisted';

  function assistedPresc(weight: number, overrides: Partial<Prescription> = {}) {
    return makePrescription({
      id: PRESC_ID,
      templateId: 'U2' as TemplateId,
      liftId: 'p1_assisted',
      weight,
      sets: 2,
      repMin: 2,
      repMax: 4,
      ...overrides,
    });
  }

  function assistedSets(reps: number, assistLb: number): SetLog[] {
    return [0, 1].map((i) => ({
      id: `${SESSION_ID}-${PRESC_ID}-${i}-X`,
      sessionLogId: SESSION_ID,
      liftId: 'p1_assisted',
      prescriptionId: PRESC_ID,
      setIndex: i,
      weight: assistLb,
      reps,
      status: 'completed' as SetStatus,
    }));
  }

  it('reduces assist by 5 lb when every set hits repMax', () => {
    const dec = decideProgression(
      assistedPresc(50),
      assistedSets(4, 50),
      makeSession({ templateId: 'U2' as TemplateId }),
    );
    expect(dec.advanced).toBe(true);
    expect(dec.nextWeight).toBe(45);
    expect(dec.reason).toMatch(/−5 lb assist/);
  });

  it('lands on 0 unassisted when assist is one step above zero', () => {
    const dec = decideProgression(
      assistedPresc(5),
      assistedSets(4, 5),
      makeSession({ templateId: 'U2' as TemplateId }),
    );
    expect(dec.advanced).toBe(true);
    expect(dec.nextWeight).toBe(0);
  });

  it('does not advance when already at 0 assist', () => {
    const dec = decideProgression(
      assistedPresc(0),
      assistedSets(4, 0),
      makeSession({ templateId: 'U2' as TemplateId }),
    );
    expect(dec.advanced).toBe(false);
    expect(dec.nextWeight).toBe(0);
    expect(dec.reason).toMatch(/Unassisted/);
  });

  it('respects prescription.increment for assist reduction', () => {
    const dec = decideProgression(
      assistedPresc(50, { increment: 10 }),
      assistedSets(4, 50),
      makeSession({ templateId: 'U2' as TemplateId }),
    );
    expect(dec.nextWeight).toBe(40);
    expect(dec.reason).toMatch(/−10 lb assist/);
  });
});

describe('decideProgression — p1 bodyweight weighted', () => {
  const PRESC_ID = 'U3-p1_bw';

  it('advances added load by catalog 2.5 lb (snap keeps quarter plates)', () => {
    const presc = makePrescription({
      id: PRESC_ID,
      templateId: 'U3' as TemplateId,
      liftId: 'p1_bw',
      weight: 10,
      sets: 3,
      repMin: 2,
      repMax: 2,
    });
    const sets: SetLog[] = [0, 1, 2].map((i) => ({
      id: `${SESSION_ID}-${PRESC_ID}-${i}-X`,
      sessionLogId: SESSION_ID,
      liftId: 'p1_bw',
      prescriptionId: PRESC_ID,
      setIndex: i,
      weight: 10,
      reps: 2,
      status: 'completed' as SetStatus,
    }));
    const dec = decideProgression(
      presc,
      sets,
      makeSession({ templateId: 'U3' as TemplateId }),
    );
    expect(dec.advanced).toBe(true);
    expect(dec.nextWeight).toBe(12.5);
    expect(dec.reason).toMatch(/\+2\.5/);
  });
});

describe('snapBarbell', () => {
  it('rounds to nearest 5', () => {
    expect(snapBarbell(137)).toBe(135);
    expect(snapBarbell(138)).toBe(140);
    expect(snapBarbell(0)).toBe(0);
  });
  it('clamps to zero', () => {
    expect(snapBarbell(-10)).toBe(0);
  });
});

describe('snapDbLoad', () => {
  it('rounds to nearest 2.5 within range', () => {
    expect(snapDbLoad(7.4)).toBe(7.5);
    expect(snapDbLoad(7.5)).toBe(7.5);
    expect(snapDbLoad(40.1)).toBe(40);
  });
  it('clamps to the 5–52.5 range', () => {
    expect(snapDbLoad(0)).toBe(5);
    expect(snapDbLoad(3)).toBe(5);
    expect(snapDbLoad(60)).toBe(52.5);
  });
});

describe('snapWorkingWeight', () => {
  it('snaps barbell bench to nearest 5 lb', () => {
    const lift = liftForSnap('bp');
    expect(snapWorkingWeight(142, lift)).toBe(140);
    expect(snapWorkingWeight(143, lift)).toBe(145);
  });

  it('snaps Bulgarian split squat (barbell) to nearest 5 lb', () => {
    const lift = liftForSnap('bss');
    expect(snapWorkingWeight(47, lift)).toBe(45);
    expect(snapWorkingWeight(48, lift)).toBe(50);
  });

  it('snaps P1 weighted pull-up added load in 2.5 steps', () => {
    const lift = liftForSnap('p1_eccentric');
    expect(snapWorkingWeight(11, lift)).toBe(10);
    expect(snapWorkingWeight(11.2, lift)).toBe(10);
    expect(snapWorkingWeight(11.3, lift)).toBe(12.5);
  });

  it('snaps p1_assisted assistance in 5 lb steps (0–50+)', () => {
    const lift = liftForSnap('p1_assisted');
    expect(snapWorkingWeight(52.4, lift)).toBe(50);
    expect(snapWorkingWeight(47.4, lift)).toBe(45);
    expect(snapWorkingWeight(2.4, lift)).toBe(0);
    expect(snapWorkingWeight(0, lift)).toBe(0);
  });

  it('snaps p1_assisted negative loads in 5 lb steps', () => {
    const lift = liftForSnap('p1_assisted');
    expect(snapWorkingWeight(-17.2, lift)).toBe(-15);
    expect(snapWorkingWeight(-12.4, lift)).toBe(-10);
  });
});
