'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from './db';

export type FitnessGoal = {
  id: string;
  text: string;
  category: 'long-term' | 'current';
  /** Optional structured target for export / tracking (text-only goals omit these). */
  metric?: string;
  target?: number;
  unit?: string;
  direction?: 'above' | 'below' | 'exact';
};

type GoalChecksBySession = Record<string, Record<string, boolean>>;
export type GoalSessionPrefs = {
  useTopThreeOnly: boolean;
};

const GOALS_META_KEY = 'fitness:goals';
const GOAL_CHECKS_META_KEY = 'fitness:goal-checks';
const GOAL_PREFS_META_KEY = 'fitness:goal-prefs';

const DEFAULT_GOALS: FitnessGoal[] = [
  {
    id: 'goal-weight-200',
    text: 'Lose weight down to 200 lbs',
    category: 'long-term',
  },
  {
    id: 'goal-quality-life',
    text: 'Better quality of life',
    category: 'long-term',
  },
  {
    id: 'goal-self-image',
    text: 'Better self image',
    category: 'long-term',
  },
  {
    id: 'goal-front-squat-technique',
    text: 'Front squat pain-free at the wrists with upright torso to bias quads and reduce low-back pump',
    category: 'current',
  },
  {
    id: 'goal-quad-accessory-expansion',
    text: 'Add at least one quad accessory beyond BSS to support squat progress and knee health',
    category: 'current',
  },
  {
    id: 'goal-front-squat-clean-prep',
    text: 'Use front squat as prep for cleans (rack mobility, positioning, and confidence)',
    category: 'current',
  },
];

export function normalizeGoals(value: unknown): FitnessGoal[] {
  const arr = Array.isArray(value) ? (value as Partial<FitnessGoal>[]) : [];
  const cleaned: FitnessGoal[] = arr
    .map(
      (x): FitnessGoal => ({
        id: String(x.id ?? '').trim(),
        text: String(x.text ?? '').trim(),
        category: x.category === 'current' ? 'current' : 'long-term',
        metric:
          x.metric !== undefined && x.metric !== null && String(x.metric).trim().length > 0
            ? String(x.metric).trim()
            : undefined,
        target:
          typeof x.target === 'number' && Number.isFinite(x.target) ? x.target : undefined,
        unit:
          x.unit !== undefined && x.unit !== null && String(x.unit).trim().length > 0
            ? String(x.unit).trim()
            : undefined,
        direction:
          x.direction === 'above' || x.direction === 'below' || x.direction === 'exact'
            ? x.direction
            : undefined,
      }),
    )
    // Replace legacy combined front-squat goal with split goals below.
    .filter((x) => x.id !== 'goal-front-squat-wrist-friendly')
    .filter((x) => x.id.length > 0 && x.text.length > 0);
  if (cleaned.length === 0) return DEFAULT_GOALS;
  return cleaned;
}

function normalizeChecks(value: unknown): GoalChecksBySession {
  if (!value || typeof value !== 'object') return {};
  const src = value as Record<string, Record<string, unknown>>;
  const out: GoalChecksBySession = {};
  for (const [sessionId, checks] of Object.entries(src)) {
    if (!sessionId || !checks || typeof checks !== 'object') continue;
    const row: Record<string, boolean> = {};
    for (const [goalId, checked] of Object.entries(checks)) {
      if (!goalId) continue;
      row[goalId] = Boolean(checked);
    }
    out[sessionId] = row;
  }
  return out;
}

function normalizeGoalSessionPrefs(value: unknown): GoalSessionPrefs {
  const v = value as Partial<GoalSessionPrefs> | undefined;
  return {
    useTopThreeOnly: Boolean(v?.useTopThreeOnly),
  };
}

export async function loadFitnessGoals(): Promise<FitnessGoal[]> {
  const row = await getDb().meta.get(GOALS_META_KEY);
  return normalizeGoals(row?.value);
}

export async function saveFitnessGoals(goals: FitnessGoal[]) {
  await getDb().meta.put({ key: GOALS_META_KEY, value: goals });
}

export async function upsertFitnessGoal(goal: FitnessGoal) {
  const goals = await loadFitnessGoals();
  const idx = goals.findIndex((g) => g.id === goal.id);
  const next = [...goals];
  if (idx >= 0) next[idx] = goal;
  else next.push(goal);
  await saveFitnessGoals(next);
}

export async function reorderFitnessGoals(fromIndex: number, toIndex: number) {
  const goals = await loadFitnessGoals();
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= goals.length || toIndex >= goals.length) return;
  if (fromIndex === toIndex) return;
  const next = [...goals];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  await saveFitnessGoals(next);
}

export async function removeFitnessGoal(goalId: string) {
  const goals = await loadFitnessGoals();
  await saveFitnessGoals(goals.filter((g) => g.id !== goalId));

  const checks = await loadGoalChecks();
  const next: GoalChecksBySession = {};
  for (const [sessionId, map] of Object.entries(checks)) {
    const row = { ...map };
    delete row[goalId];
    next[sessionId] = row;
  }
  await saveGoalChecks(next);
}

export async function loadGoalChecks(): Promise<GoalChecksBySession> {
  const row = await getDb().meta.get(GOAL_CHECKS_META_KEY);
  return normalizeChecks(row?.value);
}

export async function saveGoalChecks(checks: GoalChecksBySession) {
  await getDb().meta.put({ key: GOAL_CHECKS_META_KEY, value: checks });
}

export async function setGoalCheckedForSession(sessionId: string, goalId: string, checked: boolean) {
  const all = await loadGoalChecks();
  const row = { ...(all[sessionId] ?? {}) };
  row[goalId] = checked;
  await saveGoalChecks({ ...all, [sessionId]: row });
}

export async function loadGoalSessionPrefs(): Promise<GoalSessionPrefs> {
  const row = await getDb().meta.get(GOAL_PREFS_META_KEY);
  return normalizeGoalSessionPrefs(row?.value);
}

export async function patchGoalSessionPrefs(patch: Partial<GoalSessionPrefs>) {
  const cur = await loadGoalSessionPrefs();
  const next: GoalSessionPrefs = {
    ...cur,
    ...patch,
  };
  await getDb().meta.put({ key: GOAL_PREFS_META_KEY, value: next });
}

export function useFitnessGoals(): FitnessGoal[] | undefined {
  return useLiveQuery(async () => {
    const row = await getDb().meta.where('key').equals(GOALS_META_KEY).first();
    return normalizeGoals(row?.value);
  }, []);
}

export function useGoalChecksForSession(sessionId?: string): Record<string, boolean> | undefined {
  return useLiveQuery(async () => {
    if (!sessionId) return {};
    const row = await getDb().meta.where('key').equals(GOAL_CHECKS_META_KEY).first();
    const checks = normalizeChecks(row?.value);
    return checks[sessionId] ?? {};
  }, [sessionId]);
}

export function useGoalSessionPrefs(): GoalSessionPrefs | undefined {
  return useLiveQuery(async () => {
    const row = await getDb().meta.where('key').equals(GOAL_PREFS_META_KEY).first();
    return normalizeGoalSessionPrefs(row?.value);
  }, []);
}
