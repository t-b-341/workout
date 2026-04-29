import { format, getISOWeek, getISOWeekYear, parseISO, subDays } from 'date-fns';
import type {
  BodyweightLog,
  CardioLog,
  Lift,
  MovementPattern,
  MuscleGroup,
  ReadinessLog,
  SessionLog,
  SetLog,
  WatchFlag,
} from './types';

function sideRankForSort(s: SetLog): number {
  return s.side === 'L' ? 0 : s.side === 'R' ? 1 : 2;
}

/** Global chronological order for PR replay (matches multi-session days + per-side). */
export function sortSetsChronologically(sets: SetLog[], sessions: SessionLog[]): SetLog[] {
  const sessionDate = new Map(sessions.map((x) => [x.id, x.date]));
  return [...sets].sort((a, b) => {
    const da = sessionDate.get(a.sessionLogId) ?? '';
    const db = sessionDate.get(b.sessionLogId) ?? '';
    if (da !== db) return da < db ? -1 : da > db ? 1 : 0;
    if (a.sessionLogId !== b.sessionLogId) return a.sessionLogId < b.sessionLogId ? -1 : 1;
    if (a.setIndex !== b.setIndex) return a.setIndex - b.setIndex;
    return sideRankForSort(a) - sideRankForSort(b);
  });
}

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

// ---------- PRs ----------

export type PRBucket = {
  reps: number;
  weight: number;
  date: string;
  sessionLogId: string;
};

export type LiftPRs = {
  liftId: string;
  /** All-time best per rep value (only completed sets, weight > 0). */
  bestByReps: PRBucket[];
  /** Best estimated 1RM. */
  bestE1RM: { value: number; date: string; weight: number; reps: number } | null;
};

/** Best weight at each rep value (1, 2, ...) for a given lift. */
export function liftPRs(liftId: string, sets: SetLog[], sessions: SessionLog[]): LiftPRs {
  const sessionDate = new Map(sessions.map((s) => [s.id, s.date]));
  const bestPerReps = new Map<number, PRBucket>();
  let bestE1RM: LiftPRs['bestE1RM'] = null;
  for (const s of sets) {
    if (s.liftId !== liftId) continue;
    if (s.status !== 'completed') continue;
    if (s.weight <= 0) continue;
    const date = sessionDate.get(s.sessionLogId);
    if (!date) continue;
    const cur = bestPerReps.get(s.reps);
    if (!cur || s.weight > cur.weight) {
      bestPerReps.set(s.reps, {
        reps: s.reps,
        weight: s.weight,
        date,
        sessionLogId: s.sessionLogId,
      });
    }
    const e = est1RM(s.weight, s.reps);
    if (!bestE1RM || e > bestE1RM.value) {
      bestE1RM = { value: e, date, weight: s.weight, reps: s.reps };
    }
  }
  return {
    liftId,
    bestByReps: Array.from(bestPerReps.values()).sort((a, b) => a.reps - b.reps),
    bestE1RM,
  };
}

/** Detect whether a freshly-logged set establishes a new PR. Compare to the
 *  PR table built from `priorSets` (which must NOT include the new one). */
export function detectPR(
  set: SetLog,
  liftId: string,
  priorSets: SetLog[],
  sessions: SessionLog[],
): { repPR: boolean; e1rmPR: boolean; previousAtReps?: number } | null {
  if (set.liftId !== liftId) return null;
  if (set.status !== 'completed') return null;
  if (set.weight <= 0) return null;

  const prs = liftPRs(liftId, priorSets, sessions);
  const previousAtReps = prs.bestByReps.find((b) => b.reps === set.reps)?.weight;
  const repPR = previousAtReps == null ? true : set.weight > previousAtReps;
  const e1rmNow = est1RM(set.weight, set.reps);
  const e1rmPR = !prs.bestE1RM || e1rmNow > prs.bestE1RM.value;

  if (!repPR && !e1rmPR) return null;
  return { repPR, e1rmPR, previousAtReps };
}

/** One row per set in the session that was a rep-PR and/or e1RM-PR at log time
 *  (same rules as `detectPR`, replayed in global chronological order). */
export type SessionRecapPRItem = {
  setId: string;
  liftId: string;
  liftName: string;
  weight: number;
  reps: number;
  repPR: boolean;
  e1rmPR: boolean;
};

export function sessionRecapPRs(
  sessionId: string,
  sets: SetLog[],
  sessions: SessionLog[],
  lifts: Lift[],
): SessionRecapPRItem[] {
  const liftMap = new Map(lifts.map((l) => [l.id, l]));
  const ordered = sortSetsChronologically(sets, sessions);
  const prior: SetLog[] = [];
  const out: SessionRecapPRItem[] = [];
  for (const s of ordered) {
    if (s.sessionLogId === sessionId) {
      const lift = liftMap.get(s.liftId);
      if (lift && lift.equipment !== 'cardio' && lift.equipment !== 'time') {
        const pr = detectPR(s, s.liftId, prior, sessions);
        if (pr) {
          out.push({
            setId: s.id,
            liftId: s.liftId,
            liftName: lift.name,
            weight: s.weight,
            reps: s.reps,
            repPR: pr.repPR,
            e1rmPR: pr.e1rmPR,
          });
        }
      }
    }
    prior.push(s);
  }
  return out;
}

/**
 * Sum of rest between consecutive **logged** sets in a session (`loggedAt`
 * ascending, all lifts). The first set in that order contributes no prior gap.
 * Gaps > 2h are ignored (meal / phone break).
 *
 * When `lifts` is passed, any gap ending on a **completed cardio** set with
 * `repUnit === 'minutes'` has up to `reps` minutes subtracted (treated as active
 * cardio time, not rest — e.g. treadmill block logged once at the end).
 */
export function sessionTotalRestBetweenSetsMs(
  sessionId: string,
  sets: SetLog[],
  lifts?: Lift[],
): number {
  const liftMap = lifts ? new Map(lifts.map((l) => [l.id, l])) : null;
  const sessionSets = sets.filter((s) => s.sessionLogId === sessionId && s.loggedAt);
  if (sessionSets.length < 2) return 0;
  const sideRank = (s: SetLog) => (s.side === 'L' ? 0 : s.side === 'R' ? 1 : 2);
  const ordered = [...sessionSets].sort((a, b) => {
    const ta = Date.parse(a.loggedAt!);
    const tb = Date.parse(b.loggedAt!);
    if (ta !== tb) return ta - tb;
    if (a.liftId !== b.liftId) return a.liftId.localeCompare(b.liftId);
    if (a.setIndex !== b.setIndex) return a.setIndex - b.setIndex;
    return sideRank(a) - sideRank(b);
  });
  const maxGapMs = 2 * 60 * 60 * 1000;
  let total = 0;
  for (let i = 1; i < ordered.length; i++) {
    const gap = Date.parse(ordered[i].loggedAt!) - Date.parse(ordered[i - 1].loggedAt!);
    if (gap <= 0 || gap > maxGapMs) continue;
    let restPart = gap;
    const cur = ordered[i];
    const lift = liftMap?.get(cur.liftId);
    if (
      lift?.equipment === 'cardio'
      && lift.repUnit === 'minutes'
      && cur.status === 'completed'
    ) {
      const workMs = Math.max(0, cur.reps) * 60 * 1000;
      restPart = Math.max(0, gap - Math.min(gap, workMs));
    }
    total += restPart;
  }
  return total;
}

/** Aggregates for the finish / recap screen (one session). */
export type SessionFinishHighlights = {
  completedSetCount: number;
  /** weight × reps summed for completed, non–cardio/time sets with weight > 0. */
  strengthVolumeLb: number;
  distinctLifts: number;
  /** Best Epley e1RM among completed strength sets this session (lb). */
  bestSessionE1RmLb: number;
  /** Heaviest completed strength set by weight (ties break on reps). */
  topSet: { liftName: string; weight: number; reps: number } | null;
  reduced: number;
  skipped: number;
  substituted: number;
  /** Sum of inter-set gaps from `sessionTotalRestBetweenSetsMs`. */
  totalRestBetweenSetsMs: number;
};

export function sessionFinishHighlights(
  sessionId: string,
  sets: SetLog[],
  lifts: Lift[],
): SessionFinishHighlights {
  const liftMap = new Map(lifts.map((l) => [l.id, l]));
  let completedSetCount = 0;
  let strengthVolumeLb = 0;
  const liftIds = new Set<string>();
  let bestSessionE1RmLb = 0;
  let topSet: { liftId: string; weight: number; reps: number } | null = null;
  let reduced = 0;
  let skipped = 0;
  let substituted = 0;

  for (const s of sets) {
    if (s.sessionLogId !== sessionId) continue;
    if (s.status === 'reduced') reduced++;
    else if (s.status === 'skipped') skipped++;
    else if (s.status === 'substituted') substituted++;

    if (s.status !== 'completed') continue;
    completedSetCount++;
    liftIds.add(s.liftId);
    const lift = liftMap.get(s.liftId);
    const strength = lift && lift.equipment !== 'cardio' && lift.equipment !== 'time';
    if (strength && s.weight > 0) {
      strengthVolumeLb += s.weight * s.reps;
      const e = est1RM(s.weight, s.reps);
      if (e > bestSessionE1RmLb) bestSessionE1RmLb = e;
      if (
        !topSet
        || s.weight > topSet.weight
        || (s.weight === topSet.weight && s.reps > topSet.reps)
      ) {
        topSet = { liftId: s.liftId, weight: s.weight, reps: s.reps };
      }
    }
  }

  const topName = topSet ? (liftMap.get(topSet.liftId)?.name ?? topSet.liftId) : null;
  return {
    completedSetCount,
    strengthVolumeLb,
    distinctLifts: liftIds.size,
    bestSessionE1RmLb: Math.round(bestSessionE1RmLb),
    topSet: topSet && topName ? { liftName: topName, weight: topSet.weight, reps: topSet.reps } : null,
    reduced,
    skipped,
    substituted,
    totalRestBetweenSetsMs: sessionTotalRestBetweenSetsMs(sessionId, sets, lifts),
  };
}

/** Short factual lines for the recap (newest / most important first). */
export function sessionRecapSummaryLines(opts: {
  highlights: SessionFinishHighlights;
  progression: { advanced: number; held: number; skipped: number };
  prCount: number;
  durationMs: number | null;
  templateName: string;
  /** Strength lb per clock hour when session length is known. */
  strengthLbPerHour?: number | null;
  /** When true (e.g. replay), skip progression-related bullets — counts may be stale. */
  omitProgression?: boolean;
}): string[] {
  const lines: string[] = [];
  const h = opts.highlights;
  const p = opts.progression;

  if (opts.durationMs != null) {
    lines.push(`Finished in ${fmtDurationShort(opts.durationMs)}.`);
  }
  if (opts.strengthLbPerHour != null && opts.strengthLbPerHour > 0) {
    lines.push(
      `About ${Math.round(opts.strengthLbPerHour).toLocaleString()} lb of strength volume per clock hour.`,
    );
  }
  if (h.totalRestBetweenSetsMs > 0) {
    lines.push(`About ${fmtDurationShort(h.totalRestBetweenSetsMs)} rest between logged sets.`);
  }
  if (opts.prCount > 0) {
    lines.push(
      opts.prCount === 1
        ? 'One new personal record on the books.'
        : `${opts.prCount} new personal records on the books.`,
    );
  }
  if (!opts.omitProgression && p.advanced > 0) {
    lines.push(
      p.advanced === 1
        ? 'One lift is scheduled heavier next session.'
        : `${p.advanced} lifts move up in weight next session.`,
    );
  }
  if (h.strengthVolumeLb > 0) {
    const v = Math.round(h.strengthVolumeLb).toLocaleString();
    lines.push(`Roughly ${v} lb of strength volume across ${h.completedSetCount} completed sets.`);
  } else if (h.completedSetCount > 0) {
    lines.push(
      `${h.completedSetCount} set${h.completedSetCount === 1 ? '' : 's'} logged${
        h.distinctLifts > 0 ? ` across ${h.distinctLifts} movement${h.distinctLifts === 1 ? '' : 's'}` : ''
      }.`,
    );
  }
  if (h.topSet && lines.length < 6) {
    lines.push(`Heaviest single set: ${h.topSet.liftName} at ${h.topSet.weight} lb × ${h.topSet.reps}.`);
  } else if (h.bestSessionE1RmLb > 0 && lines.length < 6) {
    lines.push(`Session peak estimated 1RM ≈ ${h.bestSessionE1RmLb} lb (Epley).`);
  }
  const mods = h.reduced + h.skipped + h.substituted;
  if (mods > 0 && lines.length < 6) {
    const bits: string[] = [];
    if (h.reduced) bits.push(`${h.reduced} reduced`);
    if (h.skipped) bits.push(`${h.skipped} skipped`);
    if (h.substituted) bits.push(`${h.substituted} substituted`);
    lines.push(`${bits.join(', ')} — adjustments still count.`);
  }
  if (
    !opts.omitProgression &&
    p.held > 0 &&
    p.advanced === 0 &&
    opts.prCount === 0 &&
    lines.length < 6
  ) {
    lines.push('Working weights held steady — solid maintenance work.');
  }
  if (lines.length === 0) {
    lines.push(`${opts.templateName} is in the log. Showing up is the win.`);
  }
  return lines.slice(0, 6);
}

/** Chronological list of PRs across all lifts (one entry per (liftId, reps)
 *  PR event in time order). */
export type PRFeedItem = {
  date: string;
  liftId: string;
  liftName: string;
  reps: number;
  weight: number;
  /** Weight that was beaten (if any). */
  previousWeight?: number;
};

export function prFeed(sets: SetLog[], sessions: SessionLog[], lifts: Lift[]): PRFeedItem[] {
  const liftMap = new Map(lifts.map((l) => [l.id, l]));
  const sessionDate = new Map(sessions.map((s) => [s.id, s.date]));
  const ordered = sortSetsChronologically(sets, sessions);

  const bestPerLiftReps = new Map<string, number>(); // key = liftId|reps
  const out: PRFeedItem[] = [];
  for (const s of ordered) {
    if (s.status !== 'completed' || s.weight <= 0) continue;
    const lift = liftMap.get(s.liftId);
    if (!lift || lift.equipment === 'cardio' || lift.equipment === 'time') continue;
    const date = sessionDate.get(s.sessionLogId);
    if (!date) continue;
    const key = `${s.liftId}|${s.reps}`;
    const prev = bestPerLiftReps.get(key);
    if (prev == null || s.weight > prev) {
      out.push({
        date,
        liftId: s.liftId,
        liftName: lift.name,
        reps: s.reps,
        weight: s.weight,
        previousWeight: prev,
      });
      bestPerLiftReps.set(key, s.weight);
    }
  }
  return out.reverse(); // most recent first
}

// ---------- Muscle group / pattern coverage ----------

export type WeeklyVolumeByGroup = {
  week: string;
  weekStart: string;
  /** sum of (weight × reps) on completed sets, attributed to each muscle
   *  group the lift trains. (Same set can contribute to multiple groups —
   *  this is "stimulating sets / pseudo-volume," not unique work.) */
  volumeByGroup: Partial<Record<MuscleGroup, number>>;
  /** number of completed working sets per group. */
  setsByGroup: Partial<Record<MuscleGroup, number>>;
};

export function buildWeeklyMuscleVolume(
  sessions: SessionLog[],
  sets: SetLog[],
  lifts: Lift[],
): WeeklyVolumeByGroup[] {
  const liftMap = new Map(lifts.map((l) => [l.id, l]));
  const sessionDate = new Map(sessions.map((s) => [s.id, s.date]));
  const byWeek = new Map<string, WeeklyVolumeByGroup>();

  for (const s of sets) {
    if (s.status !== 'completed') continue;
    const date = sessionDate.get(s.sessionLogId);
    if (!date) continue;
    const lift = liftMap.get(s.liftId);
    if (!lift) continue;
    const groups = lift.muscleGroups ?? [];
    if (groups.length === 0) continue;
    const wk = isoWeekOf(date);

    let bucket = byWeek.get(wk);
    if (!bucket) {
      bucket = {
        week: wk,
        weekStart: startOfWeekIso(wk),
        volumeByGroup: {},
        setsByGroup: {},
      };
      byWeek.set(wk, bucket);
    }

    const vol = s.weight > 0 ? s.weight * s.reps : 0;
    for (const g of groups) {
      bucket.volumeByGroup[g] = (bucket.volumeByGroup[g] ?? 0) + vol;
      bucket.setsByGroup[g] = (bucket.setsByGroup[g] ?? 0) + 1;
    }
  }

  return Array.from(byWeek.values()).sort((a, b) => (a.week < b.week ? 1 : -1));
}

export type WeeklyPatternCoverage = {
  week: string;
  weekStart: string;
  /** Number of completed working sets per pattern. */
  setsByPattern: Partial<Record<MovementPattern, number>>;
  total: number;
};

export function buildWeeklyPatternCoverage(
  sessions: SessionLog[],
  sets: SetLog[],
  lifts: Lift[],
): WeeklyPatternCoverage[] {
  const liftMap = new Map(lifts.map((l) => [l.id, l]));
  const sessionDate = new Map(sessions.map((s) => [s.id, s.date]));
  const byWeek = new Map<string, WeeklyPatternCoverage>();

  for (const s of sets) {
    if (s.status !== 'completed') continue;
    const date = sessionDate.get(s.sessionLogId);
    if (!date) continue;
    const lift = liftMap.get(s.liftId);
    if (!lift?.pattern) continue;
    const wk = isoWeekOf(date);

    let bucket = byWeek.get(wk);
    if (!bucket) {
      bucket = { week: wk, weekStart: startOfWeekIso(wk), setsByPattern: {}, total: 0 };
      byWeek.set(wk, bucket);
    }
    bucket.setsByPattern[lift.pattern] = (bucket.setsByPattern[lift.pattern] ?? 0) + 1;
    bucket.total += 1;
  }

  return Array.from(byWeek.values()).sort((a, b) => (a.week < b.week ? 1 : -1));
}

// ---------- Bodyweight ----------

export type BodyweightPoint = {
  date: string;
  isoWeek: string;
  bodyweight: number;
  /** 4-week trailing average (inclusive of this point). */
  rolling4w: number;
};

export function bodyweightSeries(logs: BodyweightLog[]): BodyweightPoint[] {
  const sorted = [...logs].sort((a, b) => (a.date < b.date ? -1 : 1));
  const out: BodyweightPoint[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const window = sorted.slice(Math.max(0, i - 3), i + 1);
    const avg = window.reduce((s, x) => s + x.bodyweight, 0) / window.length;
    out.push({
      date: sorted[i].date,
      isoWeek: sorted[i].isoWeek,
      bodyweight: sorted[i].bodyweight,
      rolling4w: avg,
    });
  }
  return out;
}

// ---------- Readiness ----------

export type WeeklyReadiness = {
  week: string;
  weekStart: string;
  avgSleep: number;
  avgSoreness: number;
  avgMotivation: number;
  count: number;
};

export function buildWeeklyReadiness(readiness: ReadinessLog[]): WeeklyReadiness[] {
  const byWeek = new Map<string, ReadinessLog[]>();
  for (const r of readiness) {
    if (!r.date) continue;
    const wk = isoWeekOf(r.date);
    const arr = byWeek.get(wk) ?? [];
    arr.push(r);
    byWeek.set(wk, arr);
  }
  const out: WeeklyReadiness[] = [];
  for (const [week, rows] of byWeek) {
    const n = rows.length;
    out.push({
      week,
      weekStart: startOfWeekIso(week),
      avgSleep: rows.reduce((s, r) => s + r.sleepHours, 0) / n,
      avgSoreness: rows.reduce((s, r) => s + r.soreness, 0) / n,
      avgMotivation: rows.reduce((s, r) => s + r.motivation, 0) / n,
      count: n,
    });
  }
  return out.sort((a, b) => (a.week < b.week ? 1 : -1));
}

// ---------- Session duration ----------

const MS_PER_HOUR = 3_600_000;

export function sessionDurationMs(session: SessionLog, sets: SetLog[]): number | null {
  if (!session.startedAt) return null;
  const end = session.completedAt
    ? Date.parse(session.completedAt)
    : Math.max(
        Date.parse(session.startedAt),
        ...sets
          .filter((s) => s.sessionLogId === session.id && s.loggedAt)
          .map((s) => Date.parse(s.loggedAt!)),
      );
  const start = Date.parse(session.startedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, end - start);
}

/**
 * True wall-clock session length from `startedAt` — uses `nowMs` when the
 * session is still open (so the timer runs before any sets are logged).
 */
export function workoutWallClockElapsedMs(session: SessionLog, nowMs: number = Date.now()): number | null {
  if (!session.startedAt) return null;
  const start = Date.parse(session.startedAt);
  if (Number.isNaN(start)) return null;
  const end = session.completedAt ? Date.parse(session.completedAt) : nowMs;
  if (Number.isNaN(end)) return null;
  return Math.max(0, end - start);
}

/** Strength tonnage (lb) per clock hour when duration is known. */
export function strengthVolumeLbPerHour(
  strengthVolumeLb: number,
  durationMs: number | null,
): number | null {
  if (durationMs == null || durationMs <= 0) return null;
  if (strengthVolumeLb <= 0) return null;
  return strengthVolumeLb / (durationMs / MS_PER_HOUR);
}

/** Session strength volume ÷ wall-clock session length (`startedAt` → `completedAt`). */
export function sessionStrengthDensity(
  session: SessionLog,
  sets: SetLog[],
  lifts: Lift[],
): { strengthVolumeLb: number; durationMs: number | null; lbPerHour: number | null } {
  const highlights = sessionFinishHighlights(session.id, sets, lifts);
  const durationMs = sessionDurationMs(session, sets);
  return {
    strengthVolumeLb: highlights.strengthVolumeLb,
    durationMs,
    lbPerHour: strengthVolumeLbPerHour(highlights.strengthVolumeLb, durationMs),
  };
}

/** Default span for `rollingStrengthTrainingWindow` (calendar days, inclusive of `endDate`). */
export const DEFAULT_ROLLING_STRENGTH_WINDOW_DAYS = 28;

export type RollingStrengthTrainingWindow = {
  windowDays: number;
  startDate: string;
  endDate: string;
  /** Sessions with `completedAt` whose `date` falls in the window. */
  completedSessions: number;
  strengthVolumeLb: number;
  /** Sum of `sessionDurationMs` for completed sessions (only positive durations). */
  trainingDurationMs: number;
  /** How many completed sessions had a positive clock duration. */
  sessionsWithDuration: number;
  /** lb ÷ combined training hours; null if no duration or no volume. */
  lbPerTrainingHour: number | null;
  /** `strengthVolumeLb / windowDays` (tonnage spread across the calendar window). */
  strengthVolumeLbPerCalendarDay: number;
};

/**
 * Rolling window ending on `endDateIso` (YYYY-MM-DD): strength volume and density
 * over **completed** sessions only (`completedAt` set).
 */
export function rollingStrengthTrainingWindow(
  endDateIso: string,
  windowDays: number,
  sessions: SessionLog[],
  sets: SetLog[],
  lifts: Lift[],
): RollingStrengthTrainingWindow {
  const end = parseISO(endDateIso);
  const start = subDays(end, windowDays - 1);
  const startStr = format(start, 'yyyy-MM-dd');
  const endStr = endDateIso;

  let strengthVolumeLb = 0;
  let trainingDurationMs = 0;
  let sessionsWithDuration = 0;
  let completedSessions = 0;

  for (const s of sessions) {
    if (!s.completedAt) continue;
    if (s.date < startStr || s.date > endStr) continue;
    completedSessions++;
    const h = sessionFinishHighlights(s.id, sets, lifts);
    strengthVolumeLb += h.strengthVolumeLb;
    const dm = sessionDurationMs(s, sets);
    if (dm != null && dm > 0) {
      trainingDurationMs += dm;
      sessionsWithDuration++;
    }
  }

  const lbPerTrainingHour =
    trainingDurationMs > 0 ? strengthVolumeLbPerHour(strengthVolumeLb, trainingDurationMs) : null;

  return {
    windowDays,
    startDate: startStr,
    endDate: endStr,
    completedSessions,
    strengthVolumeLb,
    trainingDurationMs,
    sessionsWithDuration,
    lbPerTrainingHour,
    strengthVolumeLbPerCalendarDay: strengthVolumeLb / windowDays,
  };
}

export function fmtDurationShort(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}
