'use client';

import { useMemo, useState } from 'react';
import {
  useAllBodyweight,
  useAllReadiness,
  useAllSets,
  useLifts,
  usePrescriptions,
  useSessionsAfterReadiness,
} from '@/lib/hooks';
import { blockDateRangeForMesoIndex } from '@/lib/mesocycle';
import {
  saveMesoBoundaryPromptDismissed,
  saveMesoConfig,
  useMesoBoundaryPromptState,
  useMesoConfig,
} from '@/lib/mesocycle';
import { buildCompletedMesoBlockReport } from '@/lib/mesoBlockInsights';
import { mesoTransitionWeight } from '@/lib/deload';
import { mesoBoundaryPromptContext } from '@/lib/mesoRecommendation';
import { LIFTS } from '@/lib/seed';
import { flushDirty, localUpsert } from '@/lib/sync';
import { todayIso } from '@/lib/time';
import type { Lift, Prescription, SetLog } from '@/lib/types';

type MesoTransitionRow = {
  prescription: Prescription;
  lift: Lift;
  result: ReturnType<typeof mesoTransitionWeight>;
};

function liftName(liftId: string, lifts: Lift[]): string {
  return lifts.find((l) => l.id === liftId)?.name ?? LIFTS.find((l) => l.id === liftId)?.name ?? liftId;
}

function formatLb(n: number): string {
  return `${Math.round(n * 10) / 10} lb`;
}

/** Shown on Today and Program in week 1 of meso 2+ until dismiss or apply (Dexie dedupe). */
export function MesoBoundaryPromptCard() {
  const cfg = useMesoConfig();
  const stored = useMesoBoundaryPromptState();
  const lifts = useLifts();
  const prescriptions = usePrescriptions();
  const sessions = useSessionsAfterReadiness();
  const sets = useAllSets();
  const readiness = useAllReadiness();
  const bodyweightLogs = useAllBodyweight();
  const [busy, setBusy] = useState(false);

  const today = todayIso();
  const payload = useMemo(() => {
    if (cfg === undefined || stored === undefined) return null;
    const ctx = mesoBoundaryPromptContext(today, cfg, stored);
    if (!ctx) return null;
    const report = buildCompletedMesoBlockReport(
      cfg,
      ctx.completedMesoIndex,
      sessions ?? [],
      sets ?? [],
      readiness ?? [],
      lifts ?? [],
      today,
      bodyweightLogs ?? [],
    );
    if (!report) return null;

    const transitions: MesoTransitionRow[] = [];
    if (prescriptions && lifts && sessions && sets) {
      const range = blockDateRangeForMesoIndex(cfg, ctx.completedMesoIndex);
      if (range) {
        const sessionDateById = new Map(sessions.map((s) => [s.id, s.date]));
        const mesoSessionIds = new Set(
          sessions
            .filter((s) => s.date >= range.fromIso && s.date <= range.toIso)
            .map((s) => s.id),
        );
        const mesoSets: Array<SetLog & { date?: string }> = sets
          .filter((s) => mesoSessionIds.has(s.sessionLogId))
          .map((s) => ({ ...s, date: sessionDateById.get(s.sessionLogId) }));

        const liftById = new Map(lifts.map((l) => [l.id, l]));
        for (const p of prescriptions) {
          const lift = liftById.get(p.liftId) ?? LIFTS.find((l) => l.id === p.liftId);
          if (!lift) continue;
          if (lift.equipment === 'cardio' || lift.equipment === 'time') continue;
          transitions.push({
            prescription: p,
            lift,
            result: mesoTransitionWeight(p, lift, mesoSets),
          });
        }
      }
    }

    return { ctx, report, transitions };
  }, [bodyweightLogs, cfg, lifts, prescriptions, readiness, sessions, sets, stored, today]);

  if (!payload || !cfg) return null;

  const { ctx, report, transitions } = payload;
  const rec = report.lengthRecommendation;
  const mesoCfg = cfg;

  const advancing = transitions.filter((t) => t.result.advanced);
  const holding = transitions.filter((t) => !t.result.advanced);

  async function dismiss() {
    setBusy(true);
    try {
      await saveMesoBoundaryPromptDismissed(ctx.newMesoStartMonday);
    } finally {
      setBusy(false);
    }
  }

  async function applyMesoLength() {
    setBusy(true);
    try {
      await saveMesoConfig({
        startDate: mesoCfg.startDate,
        accumulation: Math.max(1, Math.min(12, Math.floor(rec.suggestedAccumulation))),
        deload: Math.max(0, Math.min(4, Math.floor(rec.suggestedDeload))),
      });
      await saveMesoBoundaryPromptDismissed(ctx.newMesoStartMonday);
    } finally {
      setBusy(false);
    }
  }

  async function applyStartingWeights() {
    setBusy(true);
    try {
      for (const { prescription, result } of transitions) {
        if (result.weight !== prescription.weight) {
          await localUpsert('prescriptions', { ...prescription, weight: result.weight });
        }
      }
      await flushDirty().catch(() => {});
      await saveMesoBoundaryPromptDismissed(ctx.newMesoStartMonday);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="rounded-2xl border border-amber-500/35 bg-zinc-900/90 px-4 py-3 space-y-2"
      role="region"
      aria-label="Suggestion for next mesocycle length"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs uppercase tracking-wider text-amber-200/90">New mesocycle</div>
        <span
          className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold ${
            rec.action === 'extend'
              ? 'bg-emerald-800 text-emerald-100'
              : rec.action === 'shorten'
                ? 'bg-rose-900 text-rose-200'
                : 'bg-zinc-800 text-zinc-300'
          }`}
        >
          {rec.action === 'extend' ? 'extend' : rec.action === 'shorten' ? 'shorten' : 'keep'}
        </span>
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed">
        Last block is complete. Suggested next block:{' '}
        <span className="font-mono text-zinc-200">
          {rec.suggestedAccumulation}+{rec.suggestedDeload}
        </span>{' '}
        ({rec.suggestedAccumulation + rec.suggestedDeload} weeks).
      </p>
      <p className="text-xs text-zinc-400 leading-relaxed border-t border-zinc-800 pt-2 mt-1">
        {report.trendSummary}
      </p>
      <ul className="text-[11px] text-zinc-500 list-disc pl-4 space-y-0.5 border-t border-zinc-800/80 pt-2 mt-1">
        <li>
          <span className="text-zinc-600">Volume · </span>
          {report.accumulationTrends.volume}
        </li>
        <li>
          <span className="text-zinc-600">RPE · </span>
          {report.accumulationTrends.rpe}
        </li>
        <li>
          <span className="text-zinc-600">HRV · </span>
          {report.accumulationTrends.hrv}
        </li>
        <li>
          <span className="text-zinc-600">Skipped / shortened · </span>
          {report.accumulationTrends.shortened}
        </li>
      </ul>
      {report.tagSummary && (
        <p className="text-xs text-violet-200/85 leading-relaxed">{report.tagSummary}</p>
      )}
      <ul className="text-[11px] text-zinc-500 list-disc pl-4 space-y-0.5">
        {report.strategyBullets.slice(0, 4).map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
      <p className="text-xs text-zinc-500">{rec.reason}</p>
      <p className="text-[11px] text-zinc-600">Signals: {rec.signalSummary}</p>

      {transitions.length > 0 && (
        <div className="border-t border-zinc-800 pt-3 mt-2 space-y-2">
          <div className="text-xs uppercase tracking-wider text-amber-200/90">
            Meso 2 starting weights
          </div>
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Based on end-of-meso-1 working sets. Lifts that hit the rep ceiling advance one step;
            others stay at current prescription weight.
          </p>
          {advancing.length > 0 && (
            <p className="text-xs text-zinc-300 leading-relaxed">
              <span className="text-emerald-400/90 font-medium">Advancing: </span>
              {advancing
                .map((t) => {
                  const name = liftName(t.prescription.liftId, lifts ?? []);
                  return `${name} ${formatLb(t.prescription.weight)} → ${formatLb(t.result.weight)}`;
                })
                .join(', ')}
            </p>
          )}
          {holding.length > 0 && (
            <p className="text-xs text-zinc-400 leading-relaxed">
              <span className="text-zinc-500 font-medium">Holding: </span>
              {holding
                .map((t) => `${liftName(t.prescription.liftId, lifts ?? [])} ${formatLb(t.prescription.weight)}`)
                .join(', ')}
            </p>
          )}
          <div className="flex gap-2 flex-wrap pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => void applyStartingWeights()}
              className="h-9 px-3 rounded-lg bg-sky-600 text-zinc-50 text-xs font-semibold disabled:opacity-50"
            >
              Apply starting weights
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void dismiss()}
              className="h-9 px-3 rounded-lg bg-zinc-800 text-zinc-300 text-xs"
            >
              Keep current weights
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap pt-1 border-t border-zinc-800/80">
        <button
          type="button"
          disabled={busy}
          onClick={() => void applyMesoLength()}
          className="h-9 px-3 rounded-lg bg-amber-500 text-zinc-950 text-xs font-semibold disabled:opacity-50"
        >
          Apply suggestion
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void dismiss()}
          className="h-9 px-3 rounded-lg bg-zinc-800 text-zinc-300 text-xs"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
