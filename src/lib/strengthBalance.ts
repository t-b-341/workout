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

export type RatioResult = {
  standard: LiftRatioStandard;
  numeratorValue: number;
  denominatorValue: number;
  ratio: number;
  targetMid: number;
  gapPct: number;
  roiScore: number;
  status: 'above' | 'within' | 'below';
};

function best1RmFromSets(liftSets: SetLog[]): number | null {
  let maxTest = -Infinity;
  for (const s of liftSets) {
    if (s.status !== 'completed') continue;
    if (s.intent !== 'max_test') continue;
    if (!Number.isFinite(s.weight) || s.weight <= 0) continue;
    maxTest = Math.max(maxTest, s.weight);
  }
  if (maxTest > -Infinity) return maxTest;

  let bestEst = 0;
  for (const s of liftSets) {
    if (s.status !== 'completed') continue;
    const intent = s.intent ?? 'working';
    if (intent !== 'working' && intent !== 'backoff') continue;
    if (!Number.isFinite(s.weight) || s.weight <= 0) continue;
    if (s.reps < 1 || s.reps > 20) continue;
    bestEst = Math.max(bestEst, est1RM(s.weight, s.reps));
  }
  return bestEst > 0 ? bestEst : null;
}

function liftValue(
  liftId: string,
  mode: '1rm' | 'working',
  sets: SetLog[],
  sessions: SessionLog[],
): number | null {
  if (mode === '1rm') {
    return best1RmFromSets(setsForLift(sets, liftId));
  }
  const w = mostRecentWorkingWeight(liftId, sets, sessions);
  return w != null && w > 0 ? w : null;
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
    const numeratorValue = liftValue(
      standard.numeratorLiftId,
      standard.numeratorMode,
      sets,
      sessions,
    );
    const denominatorValue = liftValue(
      standard.denominatorLiftId,
      standard.denominatorMode,
      sets,
      sessions,
    );

    if (
      numeratorValue == null
      || denominatorValue == null
      || numeratorValue <= 0
      || denominatorValue <= 0
    ) {
      continue;
    }

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
    });
  }

  return results.sort((a, b) => b.roiScore - a.roiScore);
}
