'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import type { MesoAnalysisReport } from '@/lib/exportModelSchema';
import { buildMesoAnalysisLive } from '@/lib/exportLocalDump';
import { PageShell } from '@/components/PageShell';

function RecCard({
  r,
}: {
  r: NonNullable<MesoAnalysisReport['liftRecommendations']>[number];
}) {
  const tone =
    r.recommendation === 'progress'
      ? 'border-emerald-500/40 bg-emerald-500/10'
      : r.recommendation === 'deload'
        ? 'border-rose-500/40 bg-rose-500/10'
        : r.recommendation === 'monitor'
          ? 'border-amber-500/40 bg-amber-500/10'
          : 'border-zinc-700 bg-zinc-950';
  return (
    <div className={`rounded-xl border px-3 py-2 ${tone}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-zinc-100">{r.liftName}</span>
        <span className="text-[11px] uppercase tracking-wide text-zinc-500">{r.recommendation}</span>
      </div>
      <p className="mt-1 text-sm text-zinc-300">{r.rationale}</p>
    </div>
  );
}

export function MesoAnalysisScreen() {
  const searchParams = useSearchParams();
  const startQ = searchParams.get('start');
  const endQ = searchParams.get('end');

  const [report, setReport] = useState<MesoAnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await buildMesoAnalysisLive({
        mesoStartDate: startQ?.trim() || null,
        mesoEndDate: endQ?.trim() || null,
      });
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analysis');
    } finally {
      setLoading(false);
    }
  }, [startQ, endQ]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageShell variant="program" className="p-4 space-y-4 max-w-3xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Mesocycle analysis</h1>
        <button
          type="button"
          onClick={() => void load()}
          className="h-9 px-3 rounded-lg bg-zinc-800 text-sm text-zinc-200"
        >
          Refresh
        </button>
      </div>
      <p className="text-xs text-zinc-500">
        Window: <span className="font-mono text-zinc-400">{report?.windowStart}</span>
        {' → '}
        <span className="font-mono text-zinc-400">{report?.windowEnd}</span>
        {startQ || endQ ? (
          <span className="ml-2">(from URL ?start=&amp;end= or defaults to session date range)</span>
        ) : null}
      </p>

      {loading ? (
        <div className="text-zinc-500 text-sm">Loading…</div>
      ) : error ? (
        <div className="text-rose-400 text-sm">{error}</div>
      ) : report ? (
        <>
          <section className="space-y-2">
            <h2 className="text-lg font-medium text-zinc-100">Lift recommendations</h2>
            {report.liftRecommendations && report.liftRecommendations.length > 0 ? (
              <div className="space-y-2">
                {report.liftRecommendations.map((r) => (
                  <RecCard key={r.liftId} r={r} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                {report.sectionNullNotes?.liftRecommendations ??
                  'No recommendations for this window.'}
              </p>
            )}
          </section>

          <Collapsible title="Volume progression" note={report.sectionNullNotes?.volumeProgression}>
            <pre className="text-xs overflow-x-auto text-zinc-400 bg-zinc-950 rounded-lg p-3 border border-zinc-800">
              {report.volumeProgression
                ? JSON.stringify(report.volumeProgression, null, 2)
                : 'null'}
            </pre>
          </Collapsible>

          <Collapsible title="Target deltas" note={report.sectionNullNotes?.targetDeltas}>
            <pre className="text-xs overflow-x-auto text-zinc-400 bg-zinc-950 rounded-lg p-3 border border-zinc-800">
              {report.targetDeltas ? JSON.stringify(report.targetDeltas, null, 2) : 'null'}
            </pre>
          </Collapsible>

          <Collapsible title="Completion rates" note={report.sectionNullNotes?.completionRates}>
            <pre className="text-xs overflow-x-auto text-zinc-400 bg-zinc-950 rounded-lg p-3 border border-zinc-800">
              {report.completionRates ? JSON.stringify(report.completionRates, null, 2) : 'null'}
            </pre>
          </Collapsible>

          <Collapsible title="Intent breakdown" note={report.sectionNullNotes?.intentBreakdown}>
            <pre className="text-xs overflow-x-auto text-zinc-400 bg-zinc-950 rounded-lg p-3 border border-zinc-800">
              {report.intentBreakdown ? JSON.stringify(report.intentBreakdown, null, 2) : 'null'}
            </pre>
          </Collapsible>

          <Collapsible title="Nutrition adherence" note={report.sectionNullNotes?.nutritionAdherence}>
            <pre className="text-xs overflow-x-auto text-zinc-400 bg-zinc-950 rounded-lg p-3 border border-zinc-800">
              {report.nutritionAdherence ? JSON.stringify(report.nutritionAdherence, null, 2) : 'null'}
            </pre>
          </Collapsible>

          <Collapsible title="Bodyweight trend" note={report.sectionNullNotes?.bodyweightTrend}>
            <pre className="text-xs overflow-x-auto text-zinc-400 bg-zinc-950 rounded-lg p-3 border border-zinc-800">
              {report.bodyweightTrend ? JSON.stringify(report.bodyweightTrend, null, 2) : 'null'}
            </pre>
          </Collapsible>

          <Collapsible title="Wellness correlations" note={report.sectionNullNotes?.wellnessCorrelations}>
            <pre className="text-xs overflow-x-auto text-zinc-400 bg-zinc-950 rounded-lg p-3 border border-zinc-800">
              {report.wellnessCorrelations
                ? JSON.stringify(report.wellnessCorrelations, null, 2)
                : 'null'}
            </pre>
          </Collapsible>

          <Collapsible title="Injury / review flags" note={report.sectionNullNotes?.injuryFlags}>
            <pre className="text-xs overflow-x-auto text-zinc-400 bg-zinc-950 rounded-lg p-3 border border-zinc-800">
              {report.injuryFlags ? JSON.stringify(report.injuryFlags, null, 2) : 'null'}
            </pre>
          </Collapsible>

          <Collapsible title="Mindfulness adherence" note={report.sectionNullNotes?.mindfulnessAdherence}>
            <pre className="text-xs overflow-x-auto text-zinc-400 bg-zinc-950 rounded-lg p-3 border border-zinc-800">
              {report.mindfulnessAdherence
                ? JSON.stringify(report.mindfulnessAdherence, null, 2)
                : 'null'}
            </pre>
          </Collapsible>
        </>
      ) : null}
    </PageShell>
  );
}

function Collapsible({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <details className="rounded-xl border border-zinc-800 bg-zinc-900/80">
      <summary className="cursor-pointer list-none px-3 py-2 font-medium text-zinc-200 flex flex-wrap items-center justify-between gap-2">
        <span>{title}</span>
        {note ? <span className="text-[11px] font-normal text-amber-200/90">{note}</span> : null}
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
}
