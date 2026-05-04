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

export const MESO_HEURISTICS = {
  // Require clear momentum to extend.
  minPrSignalsToExtend: 3,
  minCompletionRateToExtend: 0.85,
  maxModifiedRateToExtend: 0.1,
  maxAvgSorenessToExtend: 2.8,
  minAvgMotivationToExtend: 3.2,
  // Be more sensitive to accumulating fatigue.
  highSorenessToShorten: 3.4,
  lowMotivationToShorten: 2.4,
  highModifiedRateToShorten: 0.2,
  lowCompletionRateToShorten: 0.65,
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

  const modifiedSets = cycleSets.filter((s) => s.status !== 'completed').length;
  const modifiedRate = cycleSets.length > 0 ? modifiedSets / cycleSets.length : 0;
  const avgSoreness = cycleReadiness.length > 0
    ? cycleReadiness.reduce((sum, r) => sum + r.soreness, 0) / cycleReadiness.length
    : 0;
  const avgMotivation = cycleReadiness.length > 0
    ? cycleReadiness.reduce((sum, r) => sum + r.motivation, 0) / cycleReadiness.length
    : 0;

  const h = MESO_HEURISTICS;
  const highFatigue =
    avgSoreness >= h.highSorenessToShorten
    || avgMotivation <= h.lowMotivationToShorten
    || modifiedRate >= h.highModifiedRateToShorten
    || (cycleSessions.length > 0 && completionRate <= h.lowCompletionRateToShorten);
  const strongMomentum =
    prs >= h.minPrSignalsToExtend
    && completionRate >= h.minCompletionRateToExtend
    && modifiedRate <= h.maxModifiedRateToExtend
    && avgSoreness <= h.maxAvgSorenessToExtend
    && avgMotivation >= h.minAvgMotivationToExtend;

  if (strongMomentum && cfg.accumulation < 12) {
    const next = cfg.accumulation + 1;
    return {
      action: 'extend',
      suggestedAccumulation: next,
      suggestedDeload: cfg.deload,
      reason: copy.extend,
      signalSummary: `${prs} PR signals, ${Math.round(completionRate * 100)}% session completion, ${Math.round(modifiedRate * 100)}% modified sets`,
    };
  }
  if (highFatigue && cfg.accumulation > 1) {
    const next = cfg.accumulation - 1;
    return {
      action: 'shorten',
      suggestedAccumulation: next,
      suggestedDeload: cfg.deload,
      reason: copy.shorten,
      signalSummary: `soreness ${avgSoreness.toFixed(1)}/5, motivation ${avgMotivation.toFixed(1)}/5, ${Math.round(modifiedRate * 100)}% modified sets`,
    };
  }
  return {
    action: 'keep',
    suggestedAccumulation: cfg.accumulation,
    suggestedDeload: cfg.deload,
    reason: copy.keep,
    signalSummary: `${prs} PR signals, soreness ${avgSoreness ? avgSoreness.toFixed(1) : 'n/a'}/5, motivation ${avgMotivation ? avgMotivation.toFixed(1) : 'n/a'}/5`,
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
