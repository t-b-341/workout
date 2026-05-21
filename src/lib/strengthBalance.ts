import { setsForLift } from './liftingGoals';
import { est1RM, mostRecentWorkingWeight } from './stats';
import type { SessionLog, SetLog } from './types';

export type LiftRatioStandard = {
  id: string;
  label: string;
  numeratorLiftId: string;
  denominatorLiftId: string;
  /** Derive denominator from 1RM estimate or working weight. */
  denominatorMode: '1rm' | 'working';
  /** Derive numerator the same way. */
  numeratorMode: '1rm' | 'working';
  targetMin: number;
  targetMax: number;
  /** How many other lifts benefit from improving numerator. */
  downstreamBenefit: number;
  description: string;
};

export const RATIO_STANDARDS: LiftRatioStandard[] = [
  {
    id: 'bench_squat',
    label: 'Bench / Squat',
    numeratorLiftId: 'bp',
    denominatorLiftId: 'back_squat',
    numeratorMode: '1rm',
    denominatorMode: '1rm',
    targetMin: 0.80,
    targetMax: 0.85,
    downstreamBenefit: 2,
    description:
      'Bench 1RM should be 80–85% of squat 1RM. '
      + 'A large gap indicates upper body lagging lower '
      + 'body — the most common pattern in athletes with '
      + 'a lower body strength history. Highest priority '
      + 'ratio to close.',
  },
  {
    id: 'ohp_bench',
    label: 'OHP / Bench',
    numeratorLiftId: 'ohp',
    denominatorLiftId: 'bp',
    numeratorMode: '1rm',
    denominatorMode: '1rm',
    targetMin: 0.67,
    targetMax: 0.70,
    downstreamBenefit: 1,
    description:
      'OHP 1RM should be 67–70% of bench 1RM. '
      + 'A ratio above range means shoulder and tricep '
      + 'strength is proportionate or high relative to '
      + 'pec development — the bench is the limiter, '
      + 'not the overhead press.',
  },
  {
    id: 'pp_ohp',
    label: 'Push Press / OHP',
    numeratorLiftId: 'pp',
    denominatorLiftId: 'ohp',
    numeratorMode: '1rm',
    denominatorMode: '1rm',
    targetMin: 1.20,
    targetMax: 1.30,
    downstreamBenefit: 1,
    description:
      'Push press 1RM should be 120–130% of strict '
      + 'OHP 1RM. A ratio below range means leg drive '
      + 'is not fully contributing to the lift. This '
      + 'is a technique signal (dip-and-drive timing), '
      + 'not a strength deficit.',
  },
  {
    id: 'row_bench',
    label: 'Row / Bench',
    numeratorLiftId: 'bbr',
    denominatorLiftId: 'bp',
    numeratorMode: 'working',
    denominatorMode: '1rm',
    targetMin: 0.85,
    targetMax: 0.95,
    downstreamBenefit: 3,
    description:
      'Barbell row working weight should be 85–95% of '
      + 'bench 1RM. Gap indicates horizontal pull lagging '
      + 'horizontal push — long-term shoulder health risk '
      + 'and a direct limiter of bench stability and '
      + 'upper back thickness.',
  },
  {
    id: 'row_dl',
    label: 'Row / Deadlift',
    numeratorLiftId: 'bbr',
    denominatorLiftId: 'dl',
    numeratorMode: 'working',
    denominatorMode: 'working',
    targetMin: 0.55,
    targetMax: 0.65,
    downstreamBenefit: 3,
    description:
      'Barbell row working weight should be 55–65% of '
      + 'deadlift working weight. Gap indicates upper '
      + 'back and lat strength deficit — directly limits '
      + 'deadlift lat engagement, bar path efficiency, '
      + 'and row progression rate.',
  },
  {
    id: 'dl_squat',
    label: 'Deadlift / Squat',
    numeratorLiftId: 'dl',
    denominatorLiftId: 'back_squat',
    numeratorMode: '1rm',
    denominatorMode: '1rm',
    targetMin: 1.20,
    targetMax: 1.35,
    downstreamBenefit: 1,
    description:
      'Deadlift 1RM should be 120–135% of squat 1RM. '
      + 'A ratio near the lower bound is expected for '
      + 'quad-dominant pullers with favorable squat '
      + 'mechanics (short femurs, high bar, upright '
      + 'torso). A ratio well above range may indicate '
      + 'hamstring dominance or squat expression being '
      + 'limited by technique rather than strength.',
  },
];

export type ValueSource = {
  /** The value used in the ratio. */
  value: number;
  /** True if value is an e1RM estimate, not a direct lift. */
  isEstimate: boolean;
  /** Highest confirmed direct 1RM (single rep). Null if none. */
  directBest: number | null;
  /** e1RM estimate from best multi-rep set. Null if none. */
  estimatedBest: number | null;
  /** Set that produced directBest. Null if none. */
  directSet: { weight: number; reps: number; intent: string } | null;
  /** Set that produced estimatedBest. Null if none. */
  estimatedSet: { weight: number; reps: number; intent: string } | null;
  /**
   * True when estimatedBest > directBest by >= 5 lb —
   * suggests an untested PR opportunity on next max test.
   */
  prOpportunity: boolean;
};

export type RatioResult = {
  standard: LiftRatioStandard;
  numeratorValue: number;
  denominatorValue: number;
  ratio: number;
  targetMid: number;
  gapPct: number;
  roiScore: number;
  status: 'above' | 'within' | 'below';
  /** Source metadata for numerator (1rm mode only). */
  numeratorSource: ValueSource | null;
  /** Source metadata for denominator (1rm mode only). */
  denominatorSource: ValueSource | null;
};

type Best1RmResult = {
  value: number;
  directBest: number | null;
  estimatedBest: number | null;
  directSet: { weight: number; reps: number; intent: string } | null;
  estimatedSet: { weight: number; reps: number; intent: string } | null;
  isEstimate: boolean;
};

function best1RmFromSets(liftSets: SetLog[]): Best1RmResult | null {
  let directBest = 0;
  let directSet: Best1RmResult['directSet'] = null;
  let estimatedBest = 0;
  let estimatedSet: Best1RmResult['estimatedSet'] = null;

  for (const s of liftSets) {
    if (s.status !== 'completed') continue;
    if (!Number.isFinite(s.weight) || s.weight <= 0) continue;
    const intent = s.intent ?? 'working';
    const isMaxTest = intent === 'max_test';
    const isWorking = intent === 'working' || intent === 'backoff';

    if (!isMaxTest && !isWorking) continue;

    if (s.reps === 1) {
      if (s.weight > directBest) {
        directBest = s.weight;
        directSet = { weight: s.weight, reps: 1, intent };
      }
    } else if (s.reps >= 2 && s.reps <= 20) {
      const e = est1RM(s.weight, s.reps);
      if (e > estimatedBest) {
        estimatedBest = e;
        estimatedSet = { weight: s.weight, reps: s.reps, intent };
      }
    }
  }

  if (directBest <= 0 && estimatedBest <= 0) return null;

  const value = directBest > 0 ? directBest : estimatedBest;
  const isEstimate = directBest <= 0;

  return {
    value,
    directBest: directBest > 0 ? directBest : null,
    estimatedBest: estimatedBest > 0 ? Math.round(estimatedBest) : null,
    directSet: directBest > 0 ? directSet : null,
    estimatedSet: estimatedBest > 0 ? estimatedSet : null,
    isEstimate,
  };
}

function liftValueWithSource(
  liftId: string,
  mode: '1rm' | 'working',
  sets: SetLog[],
  sessions: SessionLog[],
): { value: number; source: ValueSource | null } | null {
  if (mode === '1rm') {
    const r = best1RmFromSets(setsForLift(sets, liftId));
    if (!r) return null;
    const prOpportunity =
      r.directBest != null &&
      r.estimatedBest != null &&
      r.estimatedBest >= r.directBest + 5;
    return {
      value: r.value,
      source: {
        value: r.value,
        isEstimate: r.isEstimate,
        directBest: r.directBest,
        estimatedBest: r.estimatedBest,
        directSet: r.directSet,
        estimatedSet: r.estimatedSet,
        prOpportunity,
      },
    };
  }
  const w = mostRecentWorkingWeight(liftId, sets, sessions);
  if (w == null || w <= 0) return null;
  return { value: w, source: null };
}

/**
 * Compute ratio results from set_logs.
 * Uses est1RM for '1rm' mode and mostRecentWorkingWeight for 'working' mode.
 */
export function computeStrengthBalance(
  sets: SetLog[],
  sessions: SessionLog[],
): RatioResult[] {
  const results: RatioResult[] = [];

  for (const standard of RATIO_STANDARDS) {
    const numResult = liftValueWithSource(
      standard.numeratorLiftId,
      standard.numeratorMode,
      sets,
      sessions,
    );
    const denResult = liftValueWithSource(
      standard.denominatorLiftId,
      standard.denominatorMode,
      sets,
      sessions,
    );

    if (!numResult || !denResult) continue;

    const numeratorValue = numResult.value;
    const denominatorValue = denResult.value;

    if (numeratorValue <= 0 || denominatorValue <= 0) continue;

    const ratio = numeratorValue / denominatorValue;
    const targetMid = (standard.targetMin + standard.targetMax) / 2;

    let status: RatioResult['status'];
    if (ratio < standard.targetMin) {
      status = 'below';
    } else if (ratio > standard.targetMax) {
      status = 'above';
    } else {
      status = 'within';
    }

    const gapPct =
      ratio >= standard.targetMin
        ? 0
        : ((standard.targetMin - ratio) / standard.targetMin) * 100;

    const roiScore = gapPct * standard.downstreamBenefit;

    results.push({
      standard,
      numeratorValue,
      denominatorValue,
      ratio,
      targetMid,
      gapPct,
      roiScore,
      status,
      numeratorSource: numResult.source,
      denominatorSource: denResult.source,
    });
  }

  return results.sort((a, b) => b.roiScore - a.roiScore);
}
