'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { getDb } from './db';
import {
  clampMindfulnessMinutes,
  MINDFULNESS_PENDING_META_PREFIX,
  sessionDateFromMindfulnessSessionId,
} from './mindfulnessPending';
import { loadWellnessTargets } from './wellnessTargets';
import { defaultTemplateForLocalDate } from './seed';
import { readTodayPlanPreference, todayPlanPreferenceIsForToday } from './todayPlanPreference';
import { isoWeekString, weekRange, todayIso } from './time';
import { buildMacroTrendAdvice, priorDatesExclusive } from './macroTrend';
import { filterSessionsAfterReadiness } from './sessionFilters';
import type {
  BodyMeasurementLog,
  BodyweightLog,
  CardioLog,
  HydrationLog,
  InjuryEpisode,
  NutritionLog,
  Prescription,
  ReadinessLog,
  SessionLog,
  SetLog,
  SleepLog,
  StressLog,
  TemplateId,
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

export function useLifts() {
  return useLiveQuery(() => getDb().lifts.toArray(), []);
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
    if (!chosenTemplateId || !templates?.length) return null;
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
 * Mindfulness minutes this ISO week: per calendar day, max of readiness logs
 * (multiple sessions/day) merged with any `mindfulness:pending:*` meta for that date.
 */
export function useThisWeekMindfulness() {
  return useLiveQuery(async () => {
    const db = getDb();
    const { start, end } = weekRange();
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');
    const byDate = new Map<string, number>();

    const readiness = await db.readiness_logs.toArray();
    for (const r of readiness) {
      if (r.date < startStr || r.date > endStr) continue;
      const m = r.mindfulnessMinutes;
      if (m == null || m <= 0) continue;
      const cm = clampMindfulnessMinutes(m);
      byDate.set(r.date, Math.max(byDate.get(r.date) ?? 0, cm));
    }

    const metaRows = await db.meta.toArray();
    for (const row of metaRows) {
      if (!row.key.startsWith(MINDFULNESS_PENDING_META_PREFIX)) continue;
      const sessionId = row.key.slice(MINDFULNESS_PENDING_META_PREFIX.length);
      const d = sessionDateFromMindfulnessSessionId(sessionId);
      if (!d || d < startStr || d > endStr) continue;
      const v = row.value;
      const rawMin =
        v && typeof v === 'object' && 'minutes' in v && typeof (v as { minutes: unknown }).minutes === 'number'
          ? (v as { minutes: number }).minutes
          : 0;
      const cm = clampMindfulnessMinutes(rawMin);
      if (cm <= 0) continue;
      byDate.set(d, Math.max(byDate.get(d) ?? 0, cm));
    }

    const total = [...byDate.values()].reduce((a, b) => a + b, 0);
    const targets = await loadWellnessTargets();
    return { total, target: targets.mindfulnessWeeklyMin };
  }, []);
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

export function useStressForDate(date: string): StressLog | undefined {
  return useLiveQuery(async () => {
    const matches = await getDb().stress_logs.where('date').equals(date).toArray();
    return matches[0];
  }, [date]);
}

export function useAllStress(): StressLog[] | undefined {
  return useLiveQuery(async () => {
    const all = await getDb().stress_logs.toArray();
    return all.sort((a, b) => (a.date < b.date ? 1 : -1));
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
