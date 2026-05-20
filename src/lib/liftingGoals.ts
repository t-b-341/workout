import { est1RM } from './stats';
import type { BodyweightLog, SetIntent, SetLog, UserGoal } from './types';

const GOAL_COUNT_INTENTS: SetIntent[] = ['max_test', 'working', 'backoff'];

function isGoalCountIntent(intent: SetIntent | undefined): boolean {
  const i = intent ?? 'working';
  return GOAL_COUNT_INTENTS.includes(i);
}

/** Match by logged lift or substitute target — never by prescription id. */
export function setsForLift(sets: SetLog[], liftId: string): SetLog[] {
  return sets.filter((s) => s.liftId === liftId || s.substituteLiftId === liftId);
}

/** Max-test weight, else best Epley e1RM from completed working/backoff sets. */
export function currentBest1RmFromSets(sets: SetLog[]): number {
  let maxTest = -Infinity;
  for (const s of sets) {
    if (s.status !== 'completed') continue;
    if (s.intent !== 'max_test') continue;
    if (!Number.isFinite(s.weight) || s.weight <= 0) continue;
    maxTest = Math.max(maxTest, s.weight);
  }
  if (maxTest > -Infinity) return maxTest;

  let bestEst = -Infinity;
  for (const s of sets) {
    if (s.status !== 'completed') continue;
    const intent = s.intent ?? 'working';
    if (intent !== 'working' && intent !== 'backoff') continue;
    if (!Number.isFinite(s.weight) || s.weight <= 0) continue;
    if (s.reps < 1 || s.reps > 20) continue;
    const e = est1RM(s.weight, s.reps);
    if (Number.isFinite(e)) bestEst = Math.max(bestEst, e);
  }
  return bestEst > -Infinity ? bestEst : 0;
}

export function bestBarbellRowWeightAt5Plus(sets: SetLog[]): number {
  let best = -Infinity;
  for (const s of sets) {
    if (s.status !== 'completed') continue;
    if (!isGoalCountIntent(s.intent)) continue;
    if (!Number.isFinite(s.weight) || s.weight <= 0) continue;
    if (s.reps < 5 || s.reps > 20) continue;
    best = Math.max(best, s.weight);
  }
  return best > -Infinity ? best : 0;
}

export function maxBwPullupReps(sets: SetLog[]): number {
  let best = -Infinity;
  for (const s of sets) {
    if (s.status !== 'completed') continue;
    if (!isGoalCountIntent(s.intent)) continue;
    if (s.weight !== 0) continue;
    if (s.reps < 1 || s.reps > 20) continue;
    if (Number.isFinite(s.reps)) best = Math.max(best, s.reps);
  }
  return best > -Infinity ? best : 0;
}

export function bestWeightAtMinReps(sets: SetLog[], minReps: number): number {
  let best = 0;
  for (const s of sets) {
    if (s.status !== 'completed') continue;
    if (!isGoalCountIntent(s.intent)) continue;
    if (s.reps < minReps || s.reps > 20) continue;
    if (!Number.isFinite(s.weight) || s.weight <= 0) continue;
    best = Math.max(best, s.weight);
  }
  return best;
}

export function bestWorkingSetWeight(sets: SetLog[]): number {
  let best = 0;
  for (const s of sets) {
    if (s.status !== 'completed') continue;
    const intent = s.intent ?? 'working';
    if (intent !== 'working' && intent !== 'backoff') continue;
    if (!Number.isFinite(s.weight) || s.weight <= 0) continue;
    best = Math.max(best, s.weight);
  }
  return best;
}

export function currentValueForGoal(
  goal: UserGoal,
  sets: SetLog[],
  bodyweightLogs?: BodyweightLog[],
): number {
  if (goal.metric === 'bodyweight') {
    if (!bodyweightLogs || bodyweightLogs.length === 0) return 0;
    const sorted = [...bodyweightLogs].sort((a, b) => (a.date < b.date ? 1 : -1));
    return sorted[0].bodyweight;
  }
  const liftSets = setsForLift(sets, goal.liftId);
  switch (goal.metric) {
    case '1rm':
      return currentBest1RmFromSets(liftSets);
    case 'working_set':
      if (goal.targetReps != null) {
        return bestWeightAtMinReps(liftSets, goal.targetReps);
      }
      return bestWorkingSetWeight(liftSets);
    case 'reps':
      return maxBwPullupReps(liftSets);
    default:
      return 0;
  }
}

export function isGoalAchieved(goal: UserGoal, currentValue: number): boolean {
  if (goal.metric === 'bodyweight') {
    return currentValue > 0 && currentValue <= goal.targetValue;
  }
  return currentValue >= goal.targetValue;
}
