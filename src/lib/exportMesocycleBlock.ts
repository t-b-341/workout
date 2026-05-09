import { buildMesoWeekStats } from '@/lib/mesoBlockInsights';
import { analyzeMesoLengthRecommendation, rollingMesoCycleExecutionSignals } from '@/lib/mesoRecommendation';
import { anchorMonday, mesocyclePosition, type MesocycleConfig } from '@/lib/mesocycle';
import type { BodyweightLog, Lift, ReadinessLog, SessionLog, SetLog } from '@/lib/types';

export type ExportMesocycleWeek = {
  week: number;
  type: 'accumulation' | 'deload';
  dateStart: string;
  dateEnd: string;
  status: 'completed' | 'current' | 'upcoming';
  volumeLbReps: number | null;
  avgRpe: number | null;
  avgHrvMs: number | null;
  sessionsDone: number | null;
  sessionsTotal: number | null;
  prCount: number | null;
  avgSoreness: number | null;
  shortPct: number | null;
};

export type ExportMesocycleBlock = {
  name: string;
  anchorDate: string;
  accumulationWeeks: number;
  deloadWeeks: number;
  currentWeek: number;
  weekByWeek: ExportMesocycleWeek[];
  lengthRecommendation: {
    suggestedAccumWeeks: number;
    suggestedDeloadWeeks: number;
    action: 'shorten' | 'extend' | 'maintain';
    rationale: string;
    signals: { soreness: number; motivation: number; modifiedSetsPct: number };
  };
};

function weekCalendarStatus(
  weekStart: string,
  weekEnd: string,
  today: string,
): 'completed' | 'current' | 'upcoming' {
  if (weekEnd < today) return 'completed';
  if (weekStart > today) return 'upcoming';
  return 'current';
}

export function buildExportMesocycleBlock(args: {
  cfg: MesocycleConfig;
  today: string;
  sessions: SessionLog[];
  sets: SetLog[];
  readiness: ReadinessLog[];
  lifts: Lift[];
  bodyweightLogs: BodyweightLog[];
}): ExportMesocycleBlock {
  const { cfg, today, sessions, sets, readiness, lifts, bodyweightLogs } = args;
  const anchorDate = anchorMonday(cfg);
  const pos = mesocyclePosition(today, cfg);
  const mesoIndex = pos?.mesoIndex ?? 1;
  const currentWeek = pos?.weekInMeso ?? 1;

  const weekRows = buildMesoWeekStats(cfg, mesoIndex, sessions, sets, readiness, lifts, today, bodyweightLogs);

  const weekByWeek: ExportMesocycleWeek[] = (weekRows ?? []).map((w) => ({
    week: w.weekInBlock,
    type: w.isDeload ? 'deload' : 'accumulation',
    dateStart: w.weekStart,
    dateEnd: w.weekEnd,
    status: weekCalendarStatus(w.weekStart, w.weekEnd, today),
    volumeLbReps: w.isFuture ? null : w.strengthVolumeLb,
    avgRpe: w.isFuture ? null : w.avgRpe,
    avgHrvMs: w.isFuture ? null : w.avgHrvRmssd,
    sessionsDone: w.isFuture ? null : w.sessionsCompleted,
    sessionsTotal: w.isFuture ? null : w.sessionDays,
    prCount: w.isFuture ? null : w.prCount,
    avgSoreness: w.isFuture ? null : w.avgSoreness,
    shortPct:
      w.isFuture || w.sessionShortenedRate == null
        ? null
        : Math.round(w.sessionShortenedRate * 1000) / 10,
  }));

  const rec = analyzeMesoLengthRecommendation(cfg, sessions, sets, readiness, lifts, today);
  const signals = rollingMesoCycleExecutionSignals(cfg, sessions, sets, readiness, today);

  return {
    name: `Meso ${mesoIndex}`,
    anchorDate,
    accumulationWeeks: cfg.accumulation,
    deloadWeeks: cfg.deload,
    currentWeek,
    weekByWeek,
    lengthRecommendation: {
      suggestedAccumWeeks: rec.suggestedAccumulation,
      suggestedDeloadWeeks: rec.suggestedDeload,
      action: rec.action === 'keep' ? 'maintain' : rec.action,
      rationale: rec.reason,
      signals,
    },
  };
}
