'use client';

import { useMemo } from 'react';
import type { MesocycleConfig, MesocyclePosition } from '@/lib/mesocycle';
import {
  buildCompletedMesoBlockReport,
  buildMesoWeekStats,
  formatAccumulationTrendLines,
  type MesoAccumulationTrends,
  type MesoWeekStat,
} from '@/lib/mesoBlockInsights';
import { fmtDate } from '@/lib/time';
import type { BodyweightLog, Lift, ReadinessLog, SessionLog, SetLog } from '@/lib/types';

function fmtVolLb(n: number | null): string {
  if (n == null) return '—';
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toLocaleString();
}

function AccumulationTrendsBlock({ trends }: { trends: MesoAccumulationTrends }) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-2.5 space-y-1.5">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">
        Accumulation trends (early vs late weeks)
      </div>
      <ul className="space-y-1 text-xs text-zinc-400 list-disc pl-4 leading-snug">
        <li>
          <span className="text-zinc-500">Volume · </span>
          {trends.volume}
        </li>
        <li>
          <span className="text-zinc-500">Avg RPE · </span>
          {trends.rpe}
        </li>
        <li>
          <span className="text-zinc-500">HRV · </span>
          {trends.hrv}
        </li>
        <li>
          <span className="text-zinc-500">Skipped / shortened sessions · </span>
          {trends.shortened}
        </li>
      </ul>
    </div>
  );
}

function WeekRow({ w }: { w: MesoWeekStat }) {
  return (
    <div
      className={`space-y-1 border-b border-zinc-800/80 pb-2 last:border-0 ${
        w.isFuture ? 'opacity-50' : ''
      }`}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-2 gap-y-1 text-xs">
        <div className="text-zinc-300 font-medium">
          {w.label}
          {w.isFuture && <span className="text-zinc-600 font-normal"> · upcoming</span>}
        </div>
        <div className="text-zinc-500 sm:col-span-1">
          {fmtDate(w.weekStart, 'MMM d')} – {fmtDate(w.weekEnd, 'd')}
        </div>
        <div className="text-zinc-400">
          Sessions: {w.isFuture ? '—' : `${w.sessionsCompleted}/${w.sessionDays || 0} done`}
        </div>
        <div className="text-zinc-400">
          PRs: {w.isFuture ? '—' : w.prCount}
          {!w.isFuture && w.avgSoreness != null && (
            <span className="text-zinc-600 ml-2">soreness {w.avgSoreness.toFixed(1)}</span>
          )}
        </div>
      </div>
      {!w.isFuture && (
        <div className="text-[11px] text-zinc-500 leading-relaxed pl-0 sm:pl-0">
          <span className="text-zinc-600">Vol </span>
          {fmtVolLb(w.strengthVolumeLb)} lb
          <span className="text-zinc-700 mx-1.5">·</span>
          <span className="text-zinc-600">RPE </span>
          {w.avgRpe != null ? w.avgRpe.toFixed(1) : '—'}
          <span className="text-zinc-700 mx-1.5">·</span>
          <span className="text-zinc-600">HRV </span>
          {w.avgHrvRmssd != null ? `${w.avgHrvRmssd.toFixed(0)} ms` : '—'}
          <span className="text-zinc-700 mx-1.5">·</span>
          <span className="text-zinc-600">Short </span>
          {w.sessionShortenedRate != null ? `${Math.round(w.sessionShortenedRate * 100)}%` : '—'}
        </div>
      )}
    </div>
  );
}

export function MesocycleInsightsSection({
  cfg,
  position,
  sessions,
  sets,
  readiness,
  lifts,
  bodyweightLogs,
  today,
}: {
  cfg: MesocycleConfig;
  position: MesocyclePosition | null;
  sessions: SessionLog[];
  sets: SetLog[];
  readiness: ReadinessLog[];
  lifts: Lift[];
  bodyweightLogs: BodyweightLog[];
  today: string;
}) {
  const currentWeeks = useMemo(() => {
    if (!position) return null;
    return buildMesoWeekStats(
      cfg,
      position.mesoIndex,
      sessions,
      sets,
      readiness,
      lifts,
      today,
      bodyweightLogs,
    );
  }, [bodyweightLogs, cfg, lifts, position, readiness, sessions, sets, today]);

  const currentAccumTrends = useMemo(() => {
    if (!currentWeeks?.length) return null;
    return formatAccumulationTrendLines(currentWeeks);
  }, [currentWeeks]);

  const previousReport = useMemo(() => {
    if (!position || position.mesoIndex < 2) return null;
    return buildCompletedMesoBlockReport(
      cfg,
      position.mesoIndex - 1,
      sessions,
      sets,
      readiness,
      lifts,
      today,
      bodyweightLogs,
    );
  }, [bodyweightLogs, cfg, lifts, position, readiness, sessions, sets, today]);

  return (
    <div className="space-y-4">
      {!position && (
        <p className="text-xs text-zinc-500 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
          Week-by-week trends appear once your mesocycle anchor is on or before today.
        </p>
      )}

      {position && currentWeeks && currentWeeks.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wider text-zinc-500">This mesocycle — week by week</div>
          <p className="text-[11px] text-zinc-600">
            Meso {position.mesoIndex}, week {position.weekInMeso} of {position.totalWeeks}
            {position.isDeload ? ' · deload' : ''}. Trends use sessions, sets, PRs, HRV, and daily check-ins.
          </p>
          {currentAccumTrends && <AccumulationTrendsBlock trends={currentAccumTrends} />}
          <div className="space-y-2 pt-1">{currentWeeks.map((w) => (
            <WeekRow key={w.weekInBlock} w={w} />
          ))}</div>
        </div>
      )}

      {position && position.mesoIndex < 2 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 text-xs text-zinc-500">
          After this mesocycle finishes, you&apos;ll get a short recap here (trends, what worked, and length ideas for the
          next block).
        </div>
      )}

      {previousReport && (
        <div className="rounded-xl border border-amber-500/25 bg-zinc-950/80 p-3 space-y-3">
          <div className="text-xs uppercase tracking-wider text-amber-200/80">
            Last mesocycle (Meso {previousReport.mesoIndex}) — recap
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">{previousReport.trendSummary}</p>
          <AccumulationTrendsBlock trends={previousReport.accumulationTrends} />
          {previousReport.tagSummary && (
            <p className="text-sm text-violet-200/90 leading-relaxed">{previousReport.tagSummary}</p>
          )}
          <p className="text-sm text-zinc-400">{previousReport.lengthRecommendation.reason}</p>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5">Strategies to consider next meso</div>
            <ul className="list-disc pl-4 space-y-1 text-sm text-zinc-400">
              {previousReport.strategyBullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </div>
          <div className="text-[11px] text-zinc-600 border-t border-zinc-800 pt-2">
            Length suggestion: {previousReport.lengthRecommendation.signalSummary}
          </div>
          <div className="space-y-2 pt-1 border-t border-zinc-800">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">That block — weekly snapshot</div>
            {previousReport.weekStats.map((w) => (
              <WeekRow key={`prev-${w.weekInBlock}`} w={w} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
