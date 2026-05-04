'use client';

import { useMemo, useState } from 'react';
import { useAllReadiness, useAllSets, useLifts, useSessionsAfterReadiness } from '@/lib/hooks';
import {
  saveMesoBoundaryPromptDismissed,
  saveMesoConfig,
  useMesoBoundaryPromptState,
  useMesoConfig,
} from '@/lib/mesocycle';
import { buildCompletedMesoBlockReport } from '@/lib/mesoBlockInsights';
import { mesoBoundaryPromptContext } from '@/lib/mesoRecommendation';
import { todayIso } from '@/lib/time';

/** Shown on Today and Program in week 1 of meso 2+ until dismiss or apply (Dexie dedupe). */
export function MesoBoundaryPromptCard() {
  const cfg = useMesoConfig();
  const stored = useMesoBoundaryPromptState();
  const lifts = useLifts();
  const sessions = useSessionsAfterReadiness();
  const sets = useAllSets();
  const readiness = useAllReadiness();
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
    );
    if (!report) return null;
    return { ctx, report };
  }, [cfg, lifts, readiness, sessions, sets, stored, today]);

  if (!payload || !cfg) return null;

  const { ctx, report } = payload;
  const rec = report.lengthRecommendation;
  const mesoCfg = cfg;

  async function dismiss() {
    setBusy(true);
    try {
      await saveMesoBoundaryPromptDismissed(ctx.newMesoStartMonday);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
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
      <div className="flex gap-2 flex-wrap pt-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => void apply()}
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
