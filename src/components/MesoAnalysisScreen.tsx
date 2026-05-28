'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { MesoAnalysisReport } from '@/lib/exportModelSchema';
import { buildMesoAnalysisLive } from '@/lib/exportLocalDump';
import { useNamedMesocycles } from '@/lib/namedMesocycles';
import { PageShell } from '@/components/PageShell';

const CUSTOM_RANGE = '__custom__';

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
  const namedMesocycles = useNamedMesocycles();
  const [userSelection, setUserSelection] = useState<string | null>(null);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [report, setReport] = useState<MesoAnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const sortedMesos = useMemo(
    () => (namedMesocycles ?? []).slice().sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [namedMesocycles],
  );

  const selection = useMemo(() => {
    if (namedMesocycles === undefined) return CUSTOM_RANGE;
    if (userSelection !== null) {
      if (userSelection === CUSTOM_RANGE) return CUSTOM_RANGE;
      if (sortedMesos.some((m) => m.id === userSelection)) return userSelection;
    }
    if (sortedMesos.length === 0) return CUSTOM_RANGE;
    return sortedMesos[0]!.id;
  }, [namedMesocycles, sortedMesos, userSelection]);

  const selectedMeso =
    selection === CUSTOM_RANGE
      ? null
      : sortedMesos.find((m) => m.id === selection) ?? null;

  const resolvedStart =
    selectedMeso?.startDate ?? (customStart.trim() || null);
  const resolvedEnd =
    selectedMeso?.endDate ?? (customEnd.trim() || null);

  const windowLabel = selectedMeso?.label ?? 'Custom';
  const canLoad = Boolean(resolvedStart && resolvedEnd);

  const load = useCallback(async () => {
    if (!canLoad) {
      setReport(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await buildMesoAnalysisLive({
        mesoStartDate: resolvedStart,
        mesoEndDate: resolvedEnd,
      });
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analysis');
    } finally {
      setLoading(false);
    }
  }, [canLoad, resolvedStart, resolvedEnd]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const showEmptyMesoHint =
    sortedMesos.length === 0 && !canLoad;

  return (
    <PageShell variant="program" className="p-4 space-y-4 max-w-3xl mx-auto">
      <Link
        href="/program"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <span aria-hidden>←</span> Program
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Mesocycle analysis</h1>
        <button
          type="button"
          onClick={() => void load()}
          disabled={!canLoad}
          className="h-9 px-3 rounded-lg bg-zinc-800 text-sm text-zinc-200 disabled:opacity-40"
        >
          Refresh
        </button>
      </div>

      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
        <label className="block text-xs text-zinc-500">
          Analysis window
          <select
            value={selection}
            onChange={(e) => setUserSelection(e.target.value)}
            className="mt-1 block w-full h-10 px-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-200"
          >
            {sortedMesos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({m.startDate} → {m.endDate})
              </option>
            ))}
            <option value={CUSTOM_RANGE}>Custom range</option>
          </select>
        </label>

        {selection === CUSTOM_RANGE && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs text-zinc-500">
              Start
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="mt-1 block w-full h-10 px-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              End
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="mt-1 block w-full h-10 px-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm"
              />
            </label>
          </div>
        )}
      </div>

      {showEmptyMesoHint ? (
        <p className="text-sm text-zinc-500">
          No mesocycles defined —{' '}
          <Link href="/program" className="text-amber-400 hover:text-amber-300 underline underline-offset-2">
            create one on Program
          </Link>
          , or pick a custom date range above.
        </p>
      ) : null}

      <p className="text-xs text-zinc-500">
        Block: <span className="text-zinc-300">{windowLabel}</span>
        {canLoad ? (
          <>
            {' · '}
            <span className="font-mono text-zinc-400">{resolvedStart}</span>
            {' → '}
            <span className="font-mono text-zinc-400">{resolvedEnd}</span>
          </>
        ) : (
          <span className="ml-2 text-zinc-600">(select dates to analyse)</span>
        )}
      </p>

      {loading ? (
        <div className="text-zinc-500 text-sm">Loading…</div>
      ) : error ? (
        <div className="text-rose-400 text-sm">{error}</div>
      ) : !canLoad ? (
        <div className="text-zinc-500 text-sm">Choose a mesocycle or enter a custom date range.</div>
      ) : report ? (
        <>
          <PrescriptionUpdatePrompt report={report} />

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

          <Collapsible title="Rep range compliance" note={report.sectionNullNotes?.repRangeCompliance}>
            <pre className="text-xs overflow-x-auto text-zinc-400 bg-zinc-950 rounded-lg p-3 border border-zinc-800">
              {report.repRangeCompliance ? JSON.stringify(report.repRangeCompliance, null, 2) : 'null'}
            </pre>
          </Collapsible>

          <Collapsible title="Prescription divergence" note={report.sectionNullNotes?.prescriptionDivergence}>
            <pre className="text-xs overflow-x-auto text-zinc-400 bg-zinc-950 rounded-lg p-3 border border-zinc-800">
              {report.prescriptionDivergence
                ? JSON.stringify(report.prescriptionDivergence, null, 2)
                : 'null'}
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

          <Collapsible title="Body measurement delta" note={report.sectionNullNotes?.bodyMeasurementDelta}>
            <pre className="text-xs overflow-x-auto text-zinc-400 bg-zinc-950 rounded-lg p-3 border border-zinc-800">
              {report.bodyMeasurementDelta
                ? JSON.stringify(report.bodyMeasurementDelta, null, 2)
                : 'null'}
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

function PrescriptionUpdatePrompt({ report }: { report: MesoAnalysisReport }) {
  const rows = useMemo(
    () => report.prescriptionDivergence?.filter((r) => r.suggestPrescriptionUpdate) ?? [],
    [report.prescriptionDivergence],
  );
  if (rows.length === 0) return null;
  return (
    <div
      role="status"
      className="rounded-2xl border border-amber-500/45 bg-amber-950/35 px-4 py-3 text-sm text-amber-100"
    >
      <div className="font-medium text-amber-50">Prescription sheet may need updating</div>
      <p className="mt-1 text-xs text-amber-200/85">
        Mean working loads diverge from programmed weights by more than 10% across multiple sessions for:
      </p>
      <ul className="mt-2 list-disc list-inside space-y-1 text-amber-100/95">
        {rows.map((r) => (
          <li key={r.liftId}>
            <span className="font-medium">{r.liftName}</span>
            {' — '}
            logged avg {r.avgActualWeight} lb vs prescribed {r.prescribedWeight} lb (
            {r.divergencePct > 0 ? '+' : ''}
            {r.divergencePct}%).
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-amber-200/75">
        Update working weights on{' '}
        <Link href="/program" className="underline underline-offset-2 text-amber-100 hover:text-white">
          Program
        </Link>
        .
      </p>
    </div>
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
