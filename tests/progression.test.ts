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
      liftId: 'bss',
      prescriptionId: PRESCRIPTION_ID,
      setIndex: Math.floor(i / 2),
      weight: 22.5,
      reps,
      status: 'completed' as SetStatus,
      side,
    }));
  }

  const presc = makePrescription({
    liftId: 'bss',
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

  it('snaps P1 weighted pull-up added load in 2.5 steps', () => {
    const lift = liftForSnap('p1_eccentric');
    expect(snapWorkingWeight(11, lift)).toBe(10);
    expect(snapWorkingWeight(11.2, lift)).toBe(10);
    expect(snapWorkingWeight(11.3, lift)).toBe(12.5);
  });

  it('allows negative assistance on p1_assisted snapped to 2.5', () => {
    const lift = liftForSnap('p1_assisted');
    expect(snapWorkingWeight(-17.2, lift)).toBe(-17.5);
    expect(snapWorkingWeight(12.4, lift)).toBe(12.5);
  });
});
