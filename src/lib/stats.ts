import { getISOWeek, getISOWeekYear, parseISO } from 'date-fns';
import type { CardioLog, Lift, SessionLog, SetLog, WatchFlag } from './types';

/** Epley estimated 1RM. */
export function est1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  return weight * (1 + reps / 30);
}

export function isoWeekOf(dateIso: string): string {
  const d = parseISO(dateIso);
  const wk = getISOWeek(d).toString().padStart(2, '0');
  return `${getISOWeekYear(d)}-W${wk}`;
}

export function startOfWeekIso(weekStr: string): string {
  // weekStr like "2026-W17" — return ISO date of Monday.
  const [y, w] = weekStr.split('-W').map((s) => parseInt(s, 10));
  // pick a Thursday in that ISO week then snap to Monday
  const jan4 = new Date(y, 0, 4);
  const jan4Day = jan4.getDay() || 7; // Mon=1..Sun=7
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - (jan4Day - 1));
  const target = new Date(week1Monday);
  target.setDate(week1Monday.getDate() + (w - 1) * 7);
  return target.toISOString().slice(0, 10);
}

export type LiftSessionPoint = {
  /** Session date (YYYY-MM-DD). */
  date: string;
  templateId: string;
  /** Top set: heaviest weight × any reps. */
  topWeight: number;
  topReps: number;
  /** Best estimated 1RM across all sets in the session. */
  best1RM: number;
  /** Total volume (sum of weight × reps across all completed sets). */
  volume: number;
  /** All sets formatted (for tooltips). */
  setsLabel: string;
  /** True if any set was non-completed. */
  hasIncomplete: boolean;
};

export function buildLiftHistory(
  liftId: string,
  sets: SetLog[],
  sessions: SessionLog[],
): LiftSessionPoint[] {
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));
  const bySession = new Map<string, SetLog[]>();
  for (const s of sets) {
    if (s.liftId !== liftId) continue;
    const arr = bySession.get(s.sessionLogId) ?? [];
    arr.push(s);
    bySession.set(s.sessionLogId, arr);
  }
  const out: LiftSessionPoint[] = [];
  for (const [sid, ss] of bySession) {
    const session = sessionMap.get(sid);
    if (!session) continue;
    const completed = ss.filter((x) => x.status === 'completed');
    if (completed.length === 0) continue;
    let topWeight = 0;
    let topReps = 0;
    let best1RM = 0;
    let volume = 0;
    for (const x of completed) {
      const e = est1RM(x.weight, x.reps);
      if (x.weight > topWeight || (x.weight === topWeight && x.reps > topReps)) {
        topWeight = x.weight;
        topReps = x.reps;
      }
      if (e > best1RM) best1RM = e;
      if (x.weight > 0) volume += x.weight * x.reps;
    }
    out.push({
      date: session.date,
      templateId: session.templateId,
      topWeight,
      topReps,
      best1RM,
      volume,
      setsLabel: ss.sort((a, b) => a.setIndex - b.setIndex).map((x) => `${x.weight}×${x.reps}${x.status === 'completed' ? '' : '*'}`).join(', '),
      hasIncomplete: ss.some((x) => x.status !== 'completed'),
    });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export type WeekSummary = {
  week: string;
  weekStart: string;
  sessionsCompleted: number;
  totalVolume: number;
  cardioMin: number;
  watchFlagCounts: Record<WatchFlag, number>;
  /** Per-lift top set this week (heaviest weight). */
  topSets: Array<{ liftId: string; liftName: string; weight: number; reps: number; date: string }>;
  modeCounts: { standard: number; light: number; skip: number; deload: number };
};

export function buildWeeklySummaries(
  sessions: SessionLog[],
  sets: SetLog[],
  cardio: CardioLog[],
  lifts: Lift[],
): WeekSummary[] {
  const liftMap = new Map(lifts.map((l) => [l.id, l]));
  const setsBySession = new Map<string, SetLog[]>();
  for (const s of sets) {
    const arr = setsBySession.get(s.sessionLogId) ?? [];
    arr.push(s);
    setsBySession.set(s.sessionLogId, arr);
  }

  const weekMap = new Map<string, WeekSummary>();
  const ensure = (week: string): WeekSummary => {
    let w = weekMap.get(week);
    if (!w) {
      w = {
        week,
        weekStart: startOfWeekIso(week),
        sessionsCompleted: 0,
        totalVolume: 0,
        cardioMin: 0,
        watchFlagCounts: { erectors: 0, elbow: 0, shoulder: 0 },
        topSets: [],
        modeCounts: { standard: 0, light: 0, skip: 0, deload: 0 },
      };
      weekMap.set(week, w);
    }
    return w;
  };

  for (const s of sessions) {
    const wk = isoWeekOf(s.date);
    const w = ensure(wk);
    if (s.completedAt) w.sessionsCompleted++;
    if (s.deload) w.modeCounts.deload++;
    if (s.mode === 'standard') w.modeCounts.standard++;
    if (s.mode === 'light') w.modeCounts.light++;
    if (s.mode === 'skip') w.modeCounts.skip++;
    for (const f of s.watchFlags) w.watchFlagCounts[f]++;

    const ss = setsBySession.get(s.id) ?? [];
    const topByLift = new Map<string, SetLog>();
    for (const x of ss) {
      if (x.status !== 'completed') continue;
      if (x.weight > 0) w.totalVolume += x.weight * x.reps;
      const cur = topByLift.get(x.liftId);
      if (!cur || x.weight > cur.weight || (x.weight === cur.weight && x.reps > cur.reps)) {
        topByLift.set(x.liftId, x);
      }
    }
    for (const [liftId, top] of topByLift) {
      const lift = liftMap.get(liftId);
      if (!lift || lift.equipment === 'cardio' || lift.equipment === 'time') continue;
      // keep the heaviest of the week per lift
      const existing = w.topSets.find((t) => t.liftId === liftId);
      if (!existing || top.weight > existing.weight || (top.weight === existing.weight && top.reps > existing.reps)) {
        const filtered = w.topSets.filter((t) => t.liftId !== liftId);
        filtered.push({ liftId, liftName: lift.name, weight: top.weight, reps: top.reps, date: s.date });
        w.topSets = filtered;
      }
    }
  }

  for (const c of cardio) {
    const wk = isoWeekOf(c.date);
    ensure(wk).cardioMin += c.durationMin ?? 0;
  }

  return Array.from(weekMap.values()).sort((a, b) => (a.week < b.week ? 1 : -1));
}
