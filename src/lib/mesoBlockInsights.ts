import {
  blockDateRangeForMesoIndex,
  blockStartMondayForMesoIndex,
  type MesocycleConfig,
} from '@/lib/mesocycle';
import {
  aggregateSessionStrategyTags,
  formatTagAggregateSentence,
  labelForSessionStrategyTag,
  type SessionStrategyTagId,
} from '@/lib/sessionStrategyTags';
import {
  analyzeCompletedBlockRecommendation,
  type MesoLengthRecommendation,
} from '@/lib/mesoRecommendation';
import { prFeed } from '@/lib/stats';
import { addDaysIso } from '@/lib/time';
import type { Lift, ReadinessLog, SessionLog, SetLog } from '@/lib/types';

function inDateRange(d: string, from: string, to: string): boolean {
  return d >= from && d <= to;
}

export type MesoWeekStat = {
  weekInBlock: number;
  label: string;
  weekStart: string;
  weekEnd: string;
  isDeload: boolean;
  /** True when the week starts after `today` (no training days yet). */
  isFuture: boolean;
  sessionsCompleted: number;
  sessionDays: number;
  prCount: number;
  avgSoreness: number | null;
  avgMotivation: number | null;
  modifiedSetRate: number | null;
  sessionCompletionRate: number | null;
};

/** Per-week snapshot for one mesocycle block (`mesoIndex` ≥ 1). */
export function buildMesoWeekStats(
  cfg: MesocycleConfig,
  mesoIndex: number,
  sessions: SessionLog[],
  sets: SetLog[],
  readiness: ReadinessLog[],
  lifts: Lift[],
  today: string,
): MesoWeekStat[] | null {
  const range = blockDateRangeForMesoIndex(cfg, mesoIndex);
  const blockStart = blockStartMondayForMesoIndex(cfg, mesoIndex);
  if (!range || !blockStart) return null;

  const totalWeeks = cfg.accumulation + cfg.deload;
  const prItems = prFeed(sets, sessions, lifts);
  const out: MesoWeekStat[] = [];

  for (let w = 1; w <= totalWeeks; w++) {
    const weekStart = addDaysIso(blockStart, (w - 1) * 7);
    const weekEnd = addDaysIso(weekStart, 6);
    const isDeload = w > cfg.accumulation;
    const isFuture = weekStart > today;

    const weekSessions = sessions.filter((s) => inDateRange(s.date, weekStart, weekEnd));
    const sessionIds = new Set(weekSessions.map((s) => s.id));
    const completed = weekSessions.filter((s) => Boolean(s.completedAt)).length;
    const sessionDays = weekSessions.length;

    const weekSets = sets.filter((st) => sessionIds.has(st.sessionLogId));
    const modified = weekSets.filter((st) => st.status !== 'completed').length;
    const modRate = weekSets.length > 0 ? modified / weekSets.length : null;
    const completionRate = sessionDays > 0 ? completed / sessionDays : null;

    const weekRx = readiness.filter((r) => inDateRange(r.date, weekStart, weekEnd));
    const avgSoreness =
      !isFuture && weekRx.length > 0
        ? weekRx.reduce((a, r) => a + r.soreness, 0) / weekRx.length
        : null;
    const avgMotivation =
      !isFuture && weekRx.length > 0
        ? weekRx.reduce((a, r) => a + r.motivation, 0) / weekRx.length
        : null;

    const prCount = isFuture
      ? 0
      : prItems.filter((p) => inDateRange(p.date, weekStart, weekEnd)).length;

    let label: string;
    if (isDeload) {
      const di = w - cfg.accumulation;
      label = cfg.deload <= 1 ? 'Deload' : `Deload W${di}`;
    } else {
      label = `Accum W${w}`;
    }

    out.push({
      weekInBlock: w,
      label,
      weekStart,
      weekEnd,
      isDeload,
      isFuture,
      sessionsCompleted: completed,
      sessionDays,
      prCount,
      avgSoreness,
      avgMotivation,
      modifiedSetRate: isFuture ? null : modRate,
      sessionCompletionRate: isFuture ? null : completionRate,
    });
  }
  return out;
}

export type MesoBlockReport = {
  mesoIndex: number;
  weekStats: MesoWeekStat[];
  lengthRecommendation: MesoLengthRecommendation;
  trendSummary: string;
  /** From optional session strategy tags in the completed block. */
  tagSummary: string | null;
  strategyBullets: string[];
};

function buildTrendSummary(accWeeks: MesoWeekStat[], deloadWeeks: MesoWeekStat[]): string {
  const acc = accWeeks.filter((w) => !w.isFuture);
  if (acc.length === 0) {
    return 'Not enough logged training in this mesocycle to summarize trends yet.';
  }
  const parts: string[] = [];
  if (acc.length >= 2) {
    const first = acc[0];
    const last = acc[acc.length - 1];
    if (first.avgSoreness != null && last.avgSoreness != null) {
      const delta = last.avgSoreness - first.avgSoreness;
      if (delta >= 0.45) {
        parts.push(
          `Soreness trended up across accumulation (about ${first.avgSoreness.toFixed(1)} → ${last.avgSoreness.toFixed(1)} on your check-ins) — fatigue stacked toward the end of the block.`,
        );
      } else if (delta <= -0.45) {
        parts.push(
          `Soreness eased across accumulation (${first.avgSoreness.toFixed(1)} → ${last.avgSoreness.toFixed(1)}), suggesting good adaptation week to week.`,
        );
      } else {
        parts.push(
          `Soreness stayed in a fairly tight band during accumulation (roughly ${first.avgSoreness.toFixed(1)}–${last.avgSoreness.toFixed(1)}).`,
        );
      }
    }
  }
  const prs = acc.reduce((s, w) => s + w.prCount, 0);
  if (prs > 0) {
    parts.push(`${prs} PR signal${prs === 1 ? '' : 's'} during accumulation.`);
  } else {
    parts.push('No PR signals in the feed for this block — still valid work if loads were held or technique work dominated.');
  }

  const d = deloadWeeks.find((w) => !w.isFuture && w.sessionDays > 0);
  if (d) {
    parts.push('Deload week has at least one logged session.');
  }

  return parts.join(' ');
}

function buildStrategyBullets(
  rec: MesoLengthRecommendation,
  accWeeks: MesoWeekStat[],
  tagCounts: Map<SessionStrategyTagId, number> | null,
): string[] {
  const bullets: string[] = [];
  if (rec.action === 'extend') {
    bullets.push('What worked: strong execution with tolerable fatigue — the meso length likely matched your recovery budget.');
    bullets.push('Next meso: you can try a similar or slightly longer accumulation if schedule and sleep stay stable.');
  } else if (rec.action === 'shorten') {
    bullets.push('What showed up: elevated strain or derailed sets relative to recovery — the block may have run long for you.');
    bullets.push('Next meso: favor a shorter accumulation, or start lighter and add less week to week.');
  } else {
    bullets.push('Mixed or neutral signals — carrying the same block length forward is a reasonable plan.');
  }

  const modSamples = accWeeks
    .map((w) => w.modifiedSetRate)
    .filter((x): x is number => x != null);
  const avgMod = modSamples.length > 0 ? modSamples.reduce((a, b) => a + b, 0) / modSamples.length : 0;
  if (avgMod >= 0.18) {
    bullets.push('A higher share of adjusted sets — emphasize sleep, fueling, and crisp reps before pushing loads next block.');
  }

  const prTotal = accWeeks.reduce((s, w) => s + w.prCount, 0);
  if (prTotal >= 3) {
    bullets.push('Multiple PRs — your progression and slot choices were effective for strength this meso.');
  }

  const comp = accWeeks
    .map((w) => w.sessionCompletionRate)
    .filter((x): x is number => x != null);
  const lowComp = comp.length > 0 && comp.some((c) => c < 0.7);
  if (lowComp) {
    bullets.push('Some weeks had incomplete sessions — next meso, protect the key lifts first if time is tight.');
  }

  if (tagCounts && tagCounts.size > 0) {
    const top = [...tagCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const [id, n] = top;
      bullets.push(
        `Your tags most often noted “${labelForSessionStrategyTag(id)}” (${n} session${n === 1 ? '' : 's'}) — lean into that pattern if it matched how you want to train.`,
      );
    }
  }

  return bullets.slice(0, 8);
}

/** Full recap for a finished meso (for Program “last block” + boundary card). */
export function buildCompletedMesoBlockReport(
  cfg: MesocycleConfig,
  completedMesoIndex: number,
  sessions: SessionLog[],
  sets: SetLog[],
  readiness: ReadinessLog[],
  lifts: Lift[],
  today: string,
): MesoBlockReport | null {
  const rec = analyzeCompletedBlockRecommendation(
    cfg,
    completedMesoIndex,
    sessions,
    sets,
    readiness,
    lifts,
  );
  if (!rec) return null;
  const weekStats = buildMesoWeekStats(
    cfg,
    completedMesoIndex,
    sessions,
    sets,
    readiness,
    lifts,
    today,
  );
  if (!weekStats) return null;

  const accWeeks = weekStats.filter((w) => !w.isDeload);
  const deloadWeeks = weekStats.filter((w) => w.isDeload);
  const trendSummary = buildTrendSummary(accWeeks, deloadWeeks);

  const range = blockDateRangeForMesoIndex(cfg, completedMesoIndex);
  const blockSessions = range
    ? sessions.filter((s) => s.date >= range.fromIso && s.date <= range.toIso)
    : [];
  const tagAgg = aggregateSessionStrategyTags(blockSessions);
  const tagSummary = formatTagAggregateSentence(tagAgg);
  const strategyBullets = buildStrategyBullets(rec, accWeeks, tagAgg.size > 0 ? tagAgg : null);

  return {
    mesoIndex: completedMesoIndex,
    weekStats,
    lengthRecommendation: rec,
    trendSummary,
    tagSummary,
    strategyBullets,
  };
}
