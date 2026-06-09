'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { getDb } from './db';
import { loadWellnessTargets } from './wellnessTargets';
import { defaultTemplateForLocalDate } from './seed';
import { readTodayPlanPreference, todayPlanPreferenceIsForToday } from './todayPlanPreference';
import { isoWeekString, weekRange, todayIso } from './time';
import { buildMacroTrendAdvice, priorDatesExclusive } from './macroTrend';
import { currentValueForGoal, isGoalAchieved } from './liftingGoals';
import { localUpsert } from './sync';
import { filterSessionsAfterReadiness } from './sessionFilters';
import type {
  BodyMeasurementLog,
  BodyweightLog,
  CardioLog,
  CbtThoughtRecord,
  StoicCheckin,
  StoicMoment,
  HydrationLog,
  InjuryEpisode,
  Lift,
  MindfulnessLog,
  NutritionLog,
  Prescription,
  ReadinessLog,
  SessionLog,
  SetLog,
  SleepLog,
  StressLog,
  SupplementLog,
  CaffeineLog,
  OralHealthLog,
  PullupLog,
  TrainingChecklistItem,
  TemplateId,
  UserGoal,
  PhaseGoal,
  BlockTemplate,
  RelationshipCheckin,
  QuickLoadout,
  QuickSessionTier,
} from './types';

export function usePrescriptions(templateId?: TemplateId): Prescription[] | undefined {
  return useLiveQuery(async () => {
    const db = getDb();
    const all = templateId
      ? await db.prescriptions.where('templateId').equals(templateId).toArray()
      : await db.prescriptions.toArray();
    return all.sort((a, b) => a.order - b.order);
  }, [templateId]);
}

/** All prescriptions keyed by template, each list sorted by `order`. */
export function usePrescriptionsByTemplate(): Map<TemplateId, Prescription[]> | undefined {
  return useLiveQuery(async () => {
    const rows = await getDb().prescriptions.toArray();
    const by = new Map<TemplateId, Prescription[]>();
    for (const p of rows) {
      const list = by.get(p.templateId) ?? [];
      list.push(p);
      by.set(p.templateId, list);
    }
    for (const list of by.values()) {
      list.sort((a, b) => a.order - b.order);
    }
    return by;
  }, []);
}

export function useLifts() {
  const normalizeLoadScale = (loadScale: Lift['loadScale']): 'normal' | 'inverse' =>
    loadScale === 'inverse' ? 'inverse' : 'normal';
  return useLiveQuery(async () => {
    const rows = await getDb().lifts.toArray();
    return rows.map((lift) => ({
      ...lift,
      loadScale: normalizeLoadScale(lift.loadScale),
    }));
  }, []);
}

export function useTemplates() {
  return useLiveQuery(() => getDb().templates.toArray(), []);
}

/**
 * Which program day (template) is “today” for the user: same rules as the Today tab
 * (saved `workout:todayPlan:v1` for the calendar day, else weekly default, else U1).
 * Use with `useTodaySession` so readiness / session rows match across tabs.
 */
export function useTodayPlanTemplateId(): TemplateId {
  const templates = useTemplates();
  const [chosenTemplateId] = useState<TemplateId | null>(() => {
    if (typeof window === 'undefined') return null;
    const p = readTodayPlanPreference();
    return todayPlanPreferenceIsForToday(p) ? p.templateId : null;
  });

  const validatedChosenTemplateId = useMemo((): TemplateId | null => {
    if (!chosenTemplateId || chosenTemplateId === 'QUICK' || !templates?.length) return null;
    return templates.some((t) => t.id === chosenTemplateId) ? chosenTemplateId : null;
  }, [templates, chosenTemplateId]);

  const suggested = useMemo(() => {
    if (!templates?.length) return undefined;
    return defaultTemplateForLocalDate(templates);
  }, [templates]);

  return validatedChosenTemplateId ?? suggested?.id ?? 'U1';
}

export function useTodaySession(templateId: TemplateId): SessionLog | undefined {
  return useLiveQuery(async () => {
    const db = getDb();
    const today = todayIso();
    const matches = await db.session_logs
      .where('date').equals(today)
      .and((s) => s.templateId === templateId)
      .toArray();
    return matches[0];
  }, [templateId]);
}

/** All session rows for a calendar day (any templates). */
export function useSessionsForDate(date: string): SessionLog[] | undefined {
  return useLiveQuery(async () => getDb().session_logs.where('date').equals(date).toArray(), [date]);
}

export function useSetsForSession(sessionId?: string): SetLog[] | undefined {
  return useLiveQuery(async () => {
    if (!sessionId) return [];
    return getDb().set_logs.where('sessionLogId').equals(sessionId).toArray();
  }, [sessionId]);
}

export function useLastSessionsForLift(liftId: string, limit = 3) {
  return useLiveQuery(async () => {
    const db = getDb();
    const sets = await db.set_logs.where('liftId').equals(liftId).toArray();
    if (sets.length === 0) return [];
    const bySession = new Map<string, SetLog[]>();
    for (const s of sets) {
      const arr = bySession.get(s.sessionLogId) ?? [];
      arr.push(s);
      bySession.set(s.sessionLogId, arr);
    }
    const sessions = await db.session_logs.bulkGet(Array.from(bySession.keys()));
    const out = sessions
      .filter((s): s is SessionLog => !!s)
      .map((s) => ({ session: s, sets: (bySession.get(s.id) ?? []).sort((a, b) => a.setIndex - b.setIndex) }))
      .sort((a, b) => (a.session.date < b.session.date ? 1 : -1));
    return out.slice(0, limit);
  }, [liftId, limit]);
}

export function useThisWeekCardio() {
  return useLiveQuery(async () => {
    const db = getDb();
    const { start, end } = weekRange();
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    const all = await db.cardio_logs.toArray();
    const wk = all.filter((c: CardioLog) => c.date >= startStr && c.date <= endStr);
    const total = wk.reduce((s, c) => s + (c.durationMin ?? 0), 0);
    const targets = await loadWellnessTargets();
    return { total, target: targets.cardioWeeklyMin, items: wk };
  }, []);
}

/**
 * Mindfulness minutes this ISO week: sum of `durationMin` on each log (time-only rows add 0).
 */
export function useThisWeekMindfulness() {
  return useLiveQuery(async () => {
    const db = getDb();
    const { start, end } = weekRange();
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');
    const all = await db.mindfulness_logs.toArray();
    const items = all.filter((m: MindfulnessLog) => m.date >= startStr && m.date <= endStr);
    const total = items.reduce((s, m) => s + (m.durationMin ?? 0), 0);
    const targets = await loadWellnessTargets();
    return { total, target: targets.mindfulnessWeeklyMin, items };
  }, []);
}

/** Latest mindfulness entries for a calendar day (any count). */
export function useMindfulnessForDate(date: string): MindfulnessLog[] | undefined {
  return useLiveQuery(async () => {
    const matches = await getDb().mindfulness_logs.where('date').equals(date).toArray();
    return matches;
  }, [date]);
}

export function useAllMindfulness(): MindfulnessLog[] | undefined {
  return useLiveQuery(async () => getDb().mindfulness_logs.toArray(), []);
}

/** Latest bodyweight entry this ISO week (any day), or undefined. */
export function useThisWeekBodyweight() {
  return useLiveQuery(async () => {
    const wk = isoWeekString();
    const matches = await getDb().bodyweight_logs.where('isoWeek').equals(wk).toArray();
    if (matches.length === 0) return undefined;
    return matches.sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  }, []);
}

/** Bodyweight row for a specific calendar day (`YYYY-MM-DD`). */
export function useBodyweightForDate(date: string): BodyweightLog | undefined {
  return useLiveQuery(async () => {
    const matches = await getDb().bodyweight_logs.where('date').equals(date).toArray();
    return matches[0];
  }, [date]);
}

export function useReadinessForSession(sessionId?: string): ReadinessLog | undefined {
  return useLiveQuery(async () => {
    if (!sessionId) return undefined;
    const matches = await getDb().readiness_logs
      .where('sessionLogId').equals(sessionId).toArray();
    return matches.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  }, [sessionId]);
}

/** Latest readiness row for a calendar day (by `createdAt`), any session. */
export function useReadinessForDate(date: string): ReadinessLog | undefined {
  return useLiveQuery(async () => {
    const matches = await getDb().readiness_logs.where('date').equals(date).toArray();
    if (matches.length === 0) return undefined;
    return matches.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  }, [date]);
}

export function useAllBodyweight(): BodyweightLog[] | undefined {
  return useLiveQuery(async () => {
    const all = await getDb().bodyweight_logs.toArray();
    return all.sort((a, b) => (a.date < b.date ? -1 : 1));
  }, []);
}

export function useAllBodyMeasurements(): BodyMeasurementLog[] | undefined {
  return useLiveQuery(async () => {
    const all = await getDb().body_measurement_logs.toArray();
    return all.sort((a, b) => (a.date < b.date ? -1 : 1));
  }, []);
}

export function useBodyMeasurementsForDate(date: string): BodyMeasurementLog | undefined {
  return useLiveQuery(async () => {
    const matches = await getDb().body_measurement_logs.where('date').equals(date).toArray();
    return matches[0];
  }, [date]);
}

export function useAllSets(): SetLog[] | undefined {
  return useLiveQuery(() => getDb().set_logs.toArray(), []);
}

/** Completed sets for History goals / strength balance (all session types, including Quick / opportunistic). */
export function useHistoryGoalSets(): SetLog[] | undefined {
  return useLiveQuery(async () => {
    const sets = await getDb().set_logs.toArray();
    return sets.filter((s) => s.status === 'completed');
  }, []);
}

export function useActiveUserGoals(): UserGoal[] | undefined {
  return useLiveQuery(async () => {
    const rows = await getDb().user_goals.toArray();
    return rows
      .filter((g) => g.active)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, []);
}

export function useAllUserGoals(): UserGoal[] | undefined {
  return useLiveQuery(
    () => getDb().user_goals.orderBy('createdAt').toArray(),
    [],
  );
}

export function useAllPhaseGoals(): PhaseGoal[] | undefined {
  return useLiveQuery(
    () => getDb().phase_goals.orderBy('startDate').toArray(),
    [],
  );
}

export function useActivePhaseGoal(): PhaseGoal | undefined {
  return useLiveQuery(async () => {
    const today = todayIso();
    const all = await getDb().phase_goals
      .filter(
        (p) => p.startDate <= today && p.endDate >= today,
      )
      .toArray();
    if (all.length === 0) return undefined;
    return all.sort((a, b) =>
      b.startDate.localeCompare(a.startDate),
    )[0];
  }, []);
}

export function useQuickLoadouts(tier?: QuickSessionTier): QuickLoadout[] | undefined {
  return useLiveQuery(
    () => {
      const q = getDb().quick_loadouts.orderBy('updatedAt').reverse();
      return tier ? q.filter((l) => l.tier === tier).toArray() : q.toArray();
    },
    [tier],
  );
}

export function useNutritionSummaryForDateRange(
  startDate: string,
  endDate: string,
): {
  trainingDays: number;
  avgActualCalories: number | null;
  adherencePct: number | null;
  avgProtein: number | null;
} | undefined {
  return useLiveQuery(async () => {
    const logs = await getDb().nutrition_logs
      .where('date')
      .between(startDate, endDate, true, true)
      .toArray();
    const sessions = await getDb().session_logs
      .where('date')
      .between(startDate, endDate, true, true)
      .toArray();
    const trainingDates = new Set(sessions.map(s => s.date));
    const trainingLogs = logs.filter(
      n => trainingDates.has(n.date) && (n.caloriesActual ?? 0) > 0
    );
    if (trainingLogs.length === 0) return {
      trainingDays: 0,
      avgActualCalories: null,
      adherencePct: null,
      avgProtein: null,
    };
    const avgCal = Math.round(
      trainingLogs.reduce((s, n) => s + (n.caloriesActual ?? 0), 0)
        / trainingLogs.length
    );
    const avgPro = Math.round(
      trainingLogs.reduce((s, n) => s + (n.proteinActualG ?? 0), 0)
        / trainingLogs.length
    );
    return {
      trainingDays: trainingLogs.length,
      avgActualCalories: avgCal,
      adherencePct: null,
      avgProtein: avgPro,
    };
  }, [startDate, endDate]);
}

export function useRecentNutritionAverages(
  days = 21,
): {
  avgTrainingCalories: number | null;
  avgProtein: number | null;
} | undefined {
  return useLiveQuery(async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const logs = await getDb().nutrition_logs
      .where('date').aboveOrEqual(cutoffIso).toArray();
    const sessions = await getDb().session_logs
      .where('date').aboveOrEqual(cutoffIso).toArray();
    const trainingDates = new Set(sessions.map(s => s.date));
    const trainingLogs = logs.filter(
      n => trainingDates.has(n.date) &&
           (n.caloriesActual ?? 0) > 0
    );
    if (trainingLogs.length === 0) return {
      avgTrainingCalories: null,
      avgProtein: null,
    };
    return {
      avgTrainingCalories: Math.round(
        trainingLogs.reduce(
          (s, n) => s + (n.caloriesActual ?? 0), 0
        ) / trainingLogs.length
      ),
      avgProtein: Math.round(
        trainingLogs.reduce(
          (s, n) => s + (n.proteinActualG ?? 0), 0
        ) / trainingLogs.length
      ),
    };
  }, [days]);
}

export function useTrainingChecklist(): TrainingChecklistItem[] | undefined {
  return useLiveQuery(
    () => getDb().training_checklist
      .orderBy('createdAt').reverse().toArray(),
    [],
  );
}

export function useOralHealthForDate(
  date: string,
): OralHealthLog | undefined {
  return useLiveQuery(
    () => getDb().oral_health_logs
      .where('date').equals(date).first(),
    [date],
  );
}

export function useCaffeineLogsForDate(
  date: string,
): CaffeineLog[] | undefined {
  return useLiveQuery(
    () => getDb().caffeine_logs
      .where('date').equals(date)
      .sortBy('loggedAt'),
    [date],
  );
}

export function useAllCaffeineLogs(): CaffeineLog[] | undefined {
  return useLiveQuery(
    () => getDb().caffeine_logs
      .orderBy('loggedAt').reverse().toArray(),
    [],
  );
}

export function usePullupLogsForDate(date: string): PullupLog[] | undefined {
  return useLiveQuery(
    () => getDb().pullup_logs.where('date').equals(date).sortBy('loggedAt'),
    [date],
  );
}

export function useThisWeekPullups(): { total: number; target: number } | undefined {
  return useLiveQuery(async () => {
    const db = getDb();
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
    const mondayIso = monday.toISOString().slice(0, 10);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const sundayIso = sunday.toISOString().slice(0, 10);
    const logs = await db.pullup_logs
      .where('date')
      .between(mondayIso, sundayIso, true, true)
      .toArray();
    const total = logs.reduce((sum, l) => sum + l.reps, 0);
    return { total, target: 50 };
  }, []);
}

export function useAllSupplementLogs(): SupplementLog[] | undefined {
  return useLiveQuery(
    () => getDb().supplement_logs.orderBy('date').reverse().toArray(),
    [],
  );
}

export function useAllBlockTemplates(): BlockTemplate[] | undefined {
  return useLiveQuery(
    () => getDb().block_templates
      .orderBy('anchorDate').reverse().toArray(),
    [],
  );
}

export function useRelationshipCheckinForDate(
  date: string,
): RelationshipCheckin | undefined {
  return useLiveQuery(
    () => getDb().relationship_checkins
      .where('date').equals(date).first(),
    [date],
  );
}

export function useRecentRelationshipCheckins(
  days = 14,
): RelationshipCheckin[] | undefined {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  return useLiveQuery(
    () => getDb().relationship_checkins
      .where('date').aboveOrEqual(cutoffIso)
      .sortBy('date'),
    [days],
  );
}

export function useGoalAchievementDetector(
  goals: UserGoal[] | undefined,
  sets: SetLog[] | undefined,
  bodyweightLogs?: BodyweightLog[],
): void {
  useEffect(() => {
    if (!goals || !sets) return;
    for (const goal of goals) {
      if (!goal.active || goal.achievedAt) continue;
      const current = currentValueForGoal(goal, sets, bodyweightLogs);
      if (isGoalAchieved(goal, current)) {
        void localUpsert('user_goals', {
          ...goal,
          achievedAt: new Date().toISOString(),
        });
      }
    }
  }, [goals, sets, bodyweightLogs]);
}

export function useAllSessions(): SessionLog[] | undefined {
  return useLiveQuery(async () => {
    const all = await getDb().session_logs.toArray();
    return all.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, []);
}

export function useAllCardio(): CardioLog[] | undefined {
  return useLiveQuery(() => getDb().cardio_logs.toArray(), []);
}

/** Calendar dates (yyyy-MM-dd) in the current ISO week with logged work (session or cardio). */
export function useWeekActivityDates(): string[] | undefined {
  return useLiveQuery(async () => {
    const { start, end } = weekRange();
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');
    const sessionsInWeek = await getDb()
      .session_logs.where('date')
      .between(startStr, endStr, true, true)
      .toArray();
    const sessionIds = new Set(sessionsInWeek.map((s) => s.id));
    const allSets = await getDb().set_logs.toArray();
    const counts = new Map<string, number>();
    for (const st of allSets) {
      if (!sessionIds.has(st.sessionLogId)) continue;
      counts.set(st.sessionLogId, (counts.get(st.sessionLogId) ?? 0) + 1);
    }
    const dates = new Set<string>();
    for (const s of sessionsInWeek) {
      const n = counts.get(s.id) ?? 0;
      if (s.startedAt || s.completedAt || n > 0) dates.add(s.date);
    }
    const cardio = await getDb().cardio_logs.toArray();
    for (const c of cardio) {
      if (c.date >= startStr && c.date <= endStr) dates.add(c.date);
    }
    return Array.from(dates).sort();
  }, []);
}

export function useAllReadiness(): ReadinessLog[] | undefined {
  return useLiveQuery(async () => {
    const all = await getDb().readiness_logs.toArray();
    return all.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, []);
}

/** Sessions that appear in History / analytics (readiness done or legacy with work logged). */
export function useSessionsAfterReadiness(): SessionLog[] | undefined {
  const sessions = useAllSessions();
  const readiness = useAllReadiness();
  return useMemo(() => {
    if (!sessions || !readiness) return undefined;
    return filterSessionsAfterReadiness(sessions, readiness);
  }, [sessions, readiness]);
}

export function useNutritionForDate(date: string): NutritionLog | undefined {
  return useLiveQuery(async () => {
    const matches = await getDb().nutrition_logs.where('date').equals(date).toArray();
    return matches[0];
  }, [date]);
}

export function useAllNutrition(): NutritionLog[] | undefined {
  return useLiveQuery(async () => {
    const all = await getDb().nutrition_logs.toArray();
    return all.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, []);
}

export function useAllHydration(): HydrationLog[] | undefined {
  return useLiveQuery(() => getDb().hydration_logs.orderBy('date').reverse().toArray());
}

export function useHydrationForDate(date: string): HydrationLog | undefined {
  return useLiveQuery(async () => {
    const matches = await getDb().hydration_logs.where('date').equals(date).toArray();
    return matches[0];
  }, [date]);
}

export function useSleepForDate(date: string): SleepLog | undefined {
  return useLiveQuery(async () => {
    const matches = await getDb().sleep_logs.where('date').equals(date).toArray();
    return matches[0];
  }, [date]);
}

export function useStressForDate(date: string): StressLog[] | undefined {
  return useLiveQuery(async () => {
    const matches = await getDb().stress_logs.where('date').equals(date).toArray();
    if (matches.length === 0) return undefined;
    return matches.sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
  }, [date]);
}

export function useCbtThoughtRecordsForDate(date: string): CbtThoughtRecord[] | undefined {
  return useLiveQuery(
    () => getDb().cbt_thought_records.where('date').equals(date).sortBy('createdAt'),
    [date],
  );
}

export function useStoicCheckinForDate(date: string): StoicCheckin | undefined {
  return useLiveQuery(
    () => getDb().stoic_checkins.where('date').equals(date).first(),
    [date],
  );
}

export function useStoicMomentsForDate(date: string): StoicMoment[] | undefined {
  return useLiveQuery(
    () => getDb().stoic_moments.where('date').equals(date).sortBy('createdAt'),
    [date],
  );
}

export function useAllStoicMoments(): StoicMoment[] | undefined {
  return useLiveQuery(
    () => getDb().stoic_moments.orderBy('createdAt').reverse().toArray(),
    [],
  );
}

export function useAllStress(): StressLog[] | undefined {
  return useLiveQuery(async () => {
    const all = await getDb().stress_logs.toArray();
    return all.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.loggedAt < b.loggedAt ? 1 : -1;
    });
  }, []);
}

export function useAllInjuryEpisodes(): InjuryEpisode[] | undefined {
  return useLiveQuery(async () => {
    const all = await getDb().injury_episodes.toArray();
    return all.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  }, []);
}

/** Macro + hydration trend on **days before** `referenceDate` (excludes that day). */
export function useMacroTrendAdvice(referenceDate: string) {
  return useLiveQuery(async () => {
    const dates = priorDatesExclusive(referenceDate, 7);
    const db = getDb();
    const [allN, allH] = await Promise.all([
      db.nutrition_logs.toArray(),
      db.hydration_logs.toArray(),
    ]);
    const nBy = new Map(allN.map((x) => [x.date, x]));
    const hBy = new Map(allH.map((x) => [x.date, x]));
    const days = dates.map((d) => ({
      date: d,
      nutrition: nBy.get(d),
      hydration: hBy.get(d),
    }));
    return buildMacroTrendAdvice(days);
  }, [referenceDate]);
}

/** Rows waiting for `flushDirty()` (Dexie `dirty` table). */
export function useDirtyQueueCount(): number | undefined {
  return useLiveQuery(() => getDb().dirty.count(), []);
}

export function useOnline() {
  const [online, setOnline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine,
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}
