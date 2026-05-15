import {
  type MesocycleConfig,
  type MesoBoundaryPromptState,
  blockDateRangeForMesoIndex,
  blockStartMondayForMesoIndex,
  mesocyclePosition,
} from '@/lib/mesocycle';
import { addDaysIso } from '@/lib/time';
import { prFeed } from '@/lib/stats';
import type { Lift, ReadinessLog, SessionLog, SetLog } from '@/lib/types';

/** Rolling-window mesocycle length hint (last `(accumulation+deload)×7` days ending `today`). */
export type MesoLengthRecommendation = {
  action: 'extend' | 'shorten' | 'keep';
  suggestedAccumulation: number;
  suggestedDeload: number;
  reason: string;
  signalSummary: string;
};

/**
 * Training execution (not derived from heuristics). Shown on Program → Mesocycle,
 * especially during the configured deload week(s).
 */
export const MESO_DELOAD_EXECUTION_GUIDANCE =
  'Run the same movements, take 1-2 sets off, 15% off your recent working weight and work back up to new limits.';

export const MESO_HEURISTICS = {
  // Require clear momentum to extend.
  minPrSignalsToExtend: 3,
  minCompletionRateToExtend: 0.85,
  maxModifiedRateToExtend: 0.1,
  maxAvgSorenessToExtend: 2.8,
  minAvgMotivationToExtend: 3.2,
  minAvgLoadProgressionToExtend: 1.5, // ≥1.5% avg gain to support extend
  // Be more sensitive to accumulating fatigue.
  highSorenessToShorten: 3.4,
  lowMotivationToShorten: 2.4,
  highModifiedRateToShorten: 0.2,
  lowCompletionRateToShorten: 0.65,
  highHrvDropToShorten: -15, // ≥15% drop from week peak → fatigue signal
  negativeLoadProgressionToShorten: -2, // ≥2% avg loss → consider shorten
  highRpeTrendToShorten: 0.6, // average RPE rose > 0.6 points → fatigue
} as const;

type RecommendationCopy = {
  extend: string;
  shorten: string;
  keep: string;
};

const ROLLING_COPY: RecommendationCopy = {
  extend:
    'Momentum looks good (PRs + strong completion + low fatigue). Extending accumulation by 1 week is likely productive.',
  shorten:
    'Fatigue signals are elevated. Shortening accumulation by 1 week should reduce overshooting and improve next-block quality.',
  keep: 'Current block length looks balanced from available cycle signals.',
};

const COMPLETED_BLOCK_COPY: RecommendationCopy = {
  extend:
    'Last mesocycle’s block showed strong momentum. Consider extending the next block by one accumulation week.',
  shorten:
    'Last mesocycle’s block showed elevated fatigue. Consider shortening the next block by one accumulation week.',
  keep:
    'Last mesocycle’s block looks balanced from available signals; keeping the same length is reasonable.',
};

/** Rolling-window readiness + modification signals (same slice as length recommendation). */
export function cycleExecutionSignals(
  cycleSets: SetLog[],
  cycleReadiness: ReadinessLog[],
  cycleSessions?: SessionLog[],
): { soreness: number; motivation: number; modifiedSetsPct: number } {
  const scheduleExcludedSessionIds = new Set<string>();
  if (cycleSessions) {
    for (const s of cycleSessions) {
      if (s.sessionType === 'opportunistic') {
        scheduleExcludedSessionIds.add(s.id);
        continue;
      }
      const isGhost = s.sessionStatus === 'ghost';
      const isSkipped = s.sessionStatus === 'skipped';
      if ((isGhost || isSkipped) && !s.completedAt) {
        scheduleExcludedSessionIds.add(s.id);
      }
    }
  }
  const scorableSets = cycleSets.filter(
    (s) => !scheduleExcludedSessionIds.has(s.sessionLogId),
  );
  const modifiedSets = scorableSets.filter((s) => s.status !== 'completed').length;
  const modifiedSetsPct =
    scorableSets.length > 0 ? (modifiedSets / scorableSets.length) * 100 : 0;
  const scorableReadiness = cycleReadiness.filter(
    (r) => !scheduleExcludedSessionIds.has(r.sessionLogId),
  );
  const soreness =
    scorableReadiness.length > 0
      ? scorableReadiness.reduce((sum, r) => sum + r.soreness, 0) / scorableReadiness.length
      : 0;
  const motivation =
    scorableReadiness.length > 0
      ? scorableReadiness.reduce((sum, r) => sum + r.motivation, 0) / scorableReadiness.length
      : 0;
  return { soreness, motivation, modifiedSetsPct };
}

/** Same date window as `analyzeMesoLengthRecommendation` (rolling `(accum+deload)×7` days ending `today`). */
export function rollingMesoCycleExecutionSignals(
  cfg: MesocycleConfig,
  sessions: SessionLog[],
  sets: SetLog[],
  readiness: ReadinessLog[],
  today: string,
): { soreness: number; motivation: number; modifiedSetsPct: number } {
  const cycleDays = (cfg.accumulation + cfg.deload) * 7;
  const fromIso = addDaysIso(today, -cycleDays + 1);
  const cycleSessions = sessions.filter((s) => s.date >= fromIso && s.date <= today);
  const cycleSessionIds = new Set(cycleSessions.map((s) => s.id));
  const cycleSets = sets.filter((s) => cycleSessionIds.has(s.sessionLogId));
  const cycleReadiness = readiness.filter((r) => r.date >= fromIso && r.date <= today);
  return cycleExecutionSignals(cycleSets, cycleReadiness, cycleSessions);
}

/**
 * Returns the percentage drop from the week's HRV peak to
 * the most recent reading. Negative = dropped. Null if fewer
 * than 3 readings in the window.
 */
function hrvTrendPct(cycleReadiness: ReadinessLog[]): number | null {
  const withHrv = cycleReadiness
    .filter((r) => r.hrvRmssd != null && !r.hrvSkipped)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (withHrv.length < 3) return null;
  const peak = Math.max(...withHrv.map((r) => r.hrvRmssd!));
  const recent = withHrv[withHrv.length - 1].hrvRmssd!;
  return ((recent - peak) / peak) * 100;
}

/**
 * Average load delta (%) across key lifts in the cycle window.
 * Returns null if fewer than 2 data points exist for any lift.
 * Key lifts: dl, back_squat, bp, ohp, pp (the main compound lifts).
 */
function avgLoadProgressionPct(
  cycleSets: SetLog[],
  cycleSessions: SessionLog[],
): number | null {
  const KEY_LIFTS = ['dl', 'back_squat', 'bp', 'ohp', 'pp'];
  const sessionDate = new Map(cycleSessions.map((s) => [s.id, s.date]));
  const deltas: number[] = [];

  for (const liftId of KEY_LIFTS) {
    const working = cycleSets
      .filter(
        (s) =>
          s.liftId === liftId &&
          s.status === 'completed' &&
          (s.intent ?? 'working') === 'working' &&
          (s.weight ?? 0) > 0 &&
          sessionDate.has(s.sessionLogId),
      )
      .sort((a, b) => {
        const da = sessionDate.get(a.sessionLogId) ?? '';
        const db = sessionDate.get(b.sessionLogId) ?? '';
        return da < db ? -1 : 1;
      });

    if (working.length < 2) continue;
    const first = working[0].weight!;
    const last = working[working.length - 1].weight!;
    if (first > 0) {
      deltas.push(((last - first) / first) * 100);
    }
  }

  if (deltas.length === 0) return null;
  return deltas.reduce((a, b) => a + b, 0) / deltas.length;
}

/**
 * Computes the average RPE trend across working sets in the
 * cycle window, split into first-half vs second-half.
 * A positive delta means RPE rose (more effort for same load)
 * → fatigue accumulation.
 * Returns null if fewer than 6 RPE-logged working sets exist.
 */
function rpeHalfTrendDelta(
  cycleSets: SetLog[],
  cycleSessions: SessionLog[],
): number | null {
  const sessionDate = new Map(cycleSessions.map((s) => [s.id, s.date]));
  const rpeLogged = cycleSets
    .filter(
      (s) =>
        s.status === 'completed' &&
        (s.intent ?? 'working') === 'working' &&
        s.rpe != null &&
        Number.isFinite(s.rpe) &&
        sessionDate.has(s.sessionLogId),
    )
    .sort((a, b) => {
      const da = sessionDate.get(a.sessionLogId) ?? '';
      const db = sessionDate.get(b.sessionLogId) ?? '';
      return da < db ? -1 : 1;
    });

  if (rpeLogged.length < 6) return null;
  const mid = Math.floor(rpeLogged.length / 2);
  const firstHalf = rpeLogged.slice(0, mid);
  const secondHalf = rpeLogged.slice(mid);
  const avgFirst = firstHalf.reduce((a, s) => a + s.rpe!, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, s) => a + s.rpe!, 0) / secondHalf.length;
  return avgSecond - avgFirst;
}

function mesoLengthRecommendationFromCycleSlice(
  cfg: MesocycleConfig,
  cycleSessions: SessionLog[],
  cycleSets: SetLog[],
  cycleReadiness: ReadinessLog[],
  lifts: Lift[],
  copy: RecommendationCopy,
): MesoLengthRecommendation {
  const prs = prFeed(cycleSets, cycleSessions, lifts).length;
  const completedSessions = cycleSessions.filter((s) => Boolean(s.completedAt)).length;
  const completionRate = cycleSessions.length > 0 ? completedSessions / cycleSessions.length : 0;

  const { soreness: avgSoreness, motivation: avgMotivation, modifiedSetsPct } = cycleExecutionSignals(
    cycleSets,
    cycleReadiness,
    cycleSessions,
  );
  const modifiedRate = modifiedSetsPct / 100;

  const h = MESO_HEURISTICS;
  const highFatigue =
    avgSoreness >= h.highSorenessToShorten
    || avgMotivation <= h.lowMotivationToShorten
    || modifiedRate >= h.highModifiedRateToShorten
    || (cycleSessions.length > 0 && completionRate <= h.lowCompletionRateToShorten);
  const hrvDrop = hrvTrendPct(cycleReadiness);
  const highHrvFatigue = hrvDrop != null && hrvDrop <= h.highHrvDropToShorten;
  const loadPct = avgLoadProgressionPct(cycleSets, cycleSessions);
  const loadSupportsExtend =
    loadPct == null || loadPct >= h.minAvgLoadProgressionToExtend;
  const loadSuggestsShorten =
    loadPct != null && loadPct <= h.negativeLoadProgressionToShorten;
  const rpeDelta = rpeHalfTrendDelta(cycleSets, cycleSessions);
  const highRpeTrend = rpeDelta != null && rpeDelta >= h.highRpeTrendToShorten;
  const anyHighFatigue =
    highFatigue || highHrvFatigue || loadSuggestsShorten || highRpeTrend;
  const loadNote = loadPct != null ? `, avg load Δ ${loadPct.toFixed(1)}%` : '';
  const strongMomentum =
    prs >= h.minPrSignalsToExtend
    && completionRate >= h.minCompletionRateToExtend
    && modifiedRate <= h.maxModifiedRateToExtend
    && avgSoreness <= h.maxAvgSorenessToExtend
    && avgMotivation >= h.minAvgMotivationToExtend
    && loadSupportsExtend;

  if (strongMomentum && cfg.accumulation < 12) {
    const next = cfg.accumulation + 1;
    return {
      action: 'extend',
      suggestedAccumulation: next,
      suggestedDeload: cfg.deload,
      reason: copy.extend,
      signalSummary: `${prs} PR signals, ${Math.round(completionRate * 100)}% session completion, ${Math.round(modifiedRate * 100)}% modified sets${loadNote}`,
    };
  }
  if (anyHighFatigue && cfg.accumulation > 1) {
    const next = cfg.accumulation - 1;
    const hrvNote =
      highHrvFatigue && hrvDrop != null
        ? `, HRV down ${Math.abs(Math.round(hrvDrop))}% from peak`
        : '';
    const rpeNote =
      highRpeTrend && rpeDelta != null
        ? `, RPE trend +${rpeDelta.toFixed(1)} pts`
        : '';
    return {
      action: 'shorten',
      suggestedAccumulation: next,
      suggestedDeload: cfg.deload,
      reason: copy.shorten,
      signalSummary: `soreness ${avgSoreness.toFixed(1)}/5, motivation ${avgMotivation.toFixed(1)}/5, ${Math.round(modifiedRate * 100)}% modified sets${hrvNote}${loadNote}${rpeNote}`,
    };
  }
  return {
    action: 'keep',
    suggestedAccumulation: cfg.accumulation,
    suggestedDeload: cfg.deload,
    reason: copy.keep,
    signalSummary: `${prs} PR signals, soreness ${avgSoreness ? avgSoreness.toFixed(1) : 'n/a'}/5, motivation ${avgMotivation ? avgMotivation.toFixed(1) : 'n/a'}/5${loadNote}`,
  };
}

export function analyzeMesoLengthRecommendation(
  cfg: MesocycleConfig,
  sessions: SessionLog[],
  sets: SetLog[],
  readiness: ReadinessLog[],
  lifts: Lift[],
  today: string,
): MesoLengthRecommendation {
  const cycleDays = (cfg.accumulation + cfg.deload) * 7;
  const fromIso = addDaysIso(today, -cycleDays + 1);
  const cycleSessions = sessions.filter((s) => s.date >= fromIso && s.date <= today);
  const cycleSessionIds = new Set(cycleSessions.map((s) => s.id));
  const cycleSets = sets.filter((s) => cycleSessionIds.has(s.sessionLogId));
  const cycleReadiness = readiness.filter((r) => r.date >= fromIso && r.date <= today);
  return mesoLengthRecommendationFromCycleSlice(
    cfg,
    cycleSessions,
    cycleSets,
    cycleReadiness,
    lifts,
    ROLLING_COPY,
  );
}

/** Score only the calendar window of meso `completedMesoIndex` (aligned block), using current `cfg` geometry. */
export function analyzeCompletedBlockRecommendation(
  cfg: MesocycleConfig,
  completedMesoIndex: number,
  sessions: SessionLog[],
  sets: SetLog[],
  readiness: ReadinessLog[],
  lifts: Lift[],
): MesoLengthRecommendation | null {
  if (completedMesoIndex < 1 || !Number.isFinite(completedMesoIndex)) return null;
  const range = blockDateRangeForMesoIndex(cfg, completedMesoIndex);
  if (!range) return null;

  const cycleSessions = sessions.filter((s) => s.date >= range.fromIso && s.date <= range.toIso);
  const cycleSessionIds = new Set(cycleSessions.map((s) => s.id));
  const cycleSets = sets.filter((s) => cycleSessionIds.has(s.sessionLogId));
  const cycleReadiness = readiness.filter((r) => r.date >= range.fromIso && r.date <= range.toIso);
  return mesoLengthRecommendationFromCycleSlice(
    cfg,
    cycleSessions,
    cycleSets,
    cycleReadiness,
    lifts,
    COMPLETED_BLOCK_COPY,
  );
}

/** First ISO week of meso M (M ≥ 2): offer a prompt unless we already handled this `newMesoStartMonday`. */
export function mesoBoundaryPromptContext(
  today: string,
  cfg: MesocycleConfig,
  stored: MesoBoundaryPromptState | null,
): { completedMesoIndex: number; newMesoStartMonday: string } | null {
  const pos = mesocyclePosition(today, cfg);
  if (!pos || pos.mesoIndex < 2 || pos.weekInMeso !== 1) return null;
  const newMesoStartMonday = blockStartMondayForMesoIndex(cfg, pos.mesoIndex);
  if (!newMesoStartMonday) return null;
  if (stored?.dismissedForNewMesoStartMonday === newMesoStartMonday) return null;
  return { completedMesoIndex: pos.mesoIndex - 1, newMesoStartMonday };
}
