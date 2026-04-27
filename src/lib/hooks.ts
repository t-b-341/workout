'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from './db';
import { CARDIO_WEEKLY_TARGET_MIN } from './seed';
import { isoWeekString, weekRange, todayIso } from './time';
import type {
  BodyweightLog,
  CardioLog,
  HydrationLog,
  NutritionLog,
  Prescription,
  ReadinessLog,
  SessionLog,
  SetLog,
  SleepLog,
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
    return { total, target: CARDIO_WEEKLY_TARGET_MIN, items: wk };
  }, []);
}

export function useThisWeekBodyweight() {
  return useLiveQuery(async () => {
    const wk = isoWeekString();
    const matches = await getDb().bodyweight_logs.where('isoWeek').equals(wk).toArray();
    return matches[0];
  }, []);
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

export function useAllReadiness(): ReadinessLog[] | undefined {
  return useLiveQuery(async () => {
    const all = await getDb().readiness_logs.toArray();
    return all.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, []);
}

export function useNutritionForDate(date: string): NutritionLog | undefined {
  return useLiveQuery(async () => {
    const matches = await getDb().nutrition_logs.where('date').equals(date).toArray();
    return matches[0];
  }, [date]);
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
