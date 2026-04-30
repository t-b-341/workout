'use client';

import { useEffect, useMemo } from 'react';
import type { SessionLog } from '@/lib/types';
import type { SessionFinishHighlights, SessionRecapPRItem } from '@/lib/stats';
import { fmtDurationShort, sessionRecapSummaryLines } from '@/lib/stats';
import { effortLabel } from '@/lib/effort';

type Props = {
  open: boolean;
  onClose: () => void;
  session: SessionLog;
  templateName: string;
  durationMs: number | null;
  /** Strength tonnage per clock hour when session length is known. */
  strengthLbPerHour: number | null;
  progression: { advanced: number; held: number; skipped: number };
  prs: SessionRecapPRItem[];
  highlights: SessionFinishHighlights;
  /** Reopened recap — progression block hidden. */
  replay?: boolean;
};

function sessionModeLabel(s: SessionLog): string {
  if (s.mode === 'skip') return 'Recovery skip';
  if (s.deload) return 'Deload';
  if (s.mode === 'light') return 'Light day';
  return 'Standard';
}

function StatChip({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-xl bg-zinc-900/90 border border-zinc-800 px-3 py-2.5 text-center ${className ?? ''}`}>
      <div className="text-[10px] uppercase tracking-wide text-zinc-500 font-medium">{label}</div>
      <div className="text-sm font-semibold text-zinc-100 mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}

export function SessionRecapSheet({
  open,
  onClose,
  session,
  templateName,
  durationMs,
  strengthLbPerHour,
  progression,
  prs,
  highlights,
  replay = false,
}: Props) {
  const summaryLines = useMemo(
    () =>
      sessionRecapSummaryLines({
        highlights,
        progression,
        prCount: prs.length,
        durationMs,
        strengthLbPerHour,
        templateName,
        omitProgression: replay,
      }),
    [highlights, progression, prs.length, durationMs, strengthLbPerHour, templateName, replay],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const effort = (session.effortScale ?? 0) !== 0
    ? ` · Effort: ${effortLabel(session.effortScale)}`
    : '';

  const durationLabel = durationMs != null ? fmtDurationShort(durationMs) : '—';
  const prLabel = prs.length === 0 ? 'None' : `${prs.length} PR${prs.length === 1 ? '' : 's'}`;
  const volLabel =
    highlights.strengthVolumeLb > 0
      ? `${Math.round(highlights.strengthVolumeLb).toLocaleString()} lb`
      : '—';
  const workLabel =
    highlights.completedSetCount > 0
      ? `${highlights.completedSetCount} sets · ${highlights.distinctLifts} lift${highlights.distinctLifts === 1 ? '' : 's'}`
      : '—';
  const restLabel =
    highlights.totalRestBetweenSetsMs > 0
      ? fmtDurationShort(highlights.totalRestBetweenSetsMs)
      : '—';
  const densityLabel =
    strengthLbPerHour != null && strengthLbPerHour > 0
      ? `${Math.round(strengthLbPerHour).toLocaleString()} lb/h`
      : '—';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
      <button
        type="button"
        aria-label="Close recap"
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-recap-title"
        className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-amber-500/20 bg-zinc-950 shadow-2xl max-h-[min(90dvh,680px)] flex flex-col overflow-hidden"
      >
        <div className="px-5 pt-6 pb-4 bg-gradient-to-b from-amber-500/10 to-transparent border-b border-zinc-800 shrink-0">
          <p className="text-amber-400 text-sm font-medium tracking-wide uppercase">
            {replay ? 'Recap' : 'All done'}
          </p>
          <h2 id="session-recap-title" className="text-2xl font-bold text-zinc-50 mt-1">
            {replay ? 'Session recap' : 'Workout complete!'}
          </h2>
          <p className="text-sm text-zinc-400 mt-2">
            {templateName}
            <span className="text-zinc-600"> · </span>
            {session.date}
            <span className="text-zinc-600"> · </span>
            {sessionModeLabel(session)}
            {effort}
          </p>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-2">
              At a glance
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <StatChip label="Time" value={durationLabel} />
              <StatChip label="PRs" value={prLabel} />
              <StatChip label="Rest (logged)" value={restLabel} />
              <StatChip label="Strength volume" value={volLabel} />
              <StatChip label="Volume / hour" value={densityLabel} className="col-span-2" />
              <StatChip label="Work logged" value={workLabel} className="col-span-2" />
            </div>
            {highlights.bestSessionE1RmLb > 0 && (
              <p className="text-xs text-zinc-500 mt-2 text-center font-mono">
                Session peak e1RM ≈ {highlights.bestSessionE1RmLb} lb
              </p>
            )}
          </div>

          <section className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-4">
            <h3 className="text-xs font-medium uppercase tracking-wide text-amber-500/90 mb-2">
              Summary
            </h3>
            <ul className="space-y-2 text-sm text-zinc-300 leading-snug list-disc pl-4 marker:text-amber-500/60">
              {summaryLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </section>

          {!replay ? (
            <section>
              <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-2">
                Progression
              </h3>
              <div className="text-sm text-zinc-300 space-x-2">
                <span className="text-emerald-400">{progression.advanced} advanced</span>
                <span className="text-zinc-600">·</span>
                <span className="text-amber-400">{progression.held} held</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-500">{progression.skipped} skipped</span>
              </div>
            </section>
          ) : (
            <section>
              <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-2">
                Progression
              </h3>
              <p className="text-sm text-zinc-500 leading-snug">
                Progression was applied when you finished. Today&apos;s prescriptions may already
                reflect updates — use Re-run progression if you changed logged sets.
              </p>
            </section>
          )}

          <section>
            <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-2">
              PRs today
            </h3>
            {prs.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No PRs this session — consistency still counts.
              </p>
            ) : (
              <ul className="space-y-2">
                {prs.map((row) => (
                  <li
                    key={row.setId}
                    className="rounded-xl bg-zinc-900/80 border border-zinc-800 px-3 py-2.5"
                  >
                    <div className="font-medium text-zinc-200 text-sm">{row.liftName}</div>
                    <div className="text-zinc-400 text-sm mt-0.5">
                      {row.liftId === 'liss' ? (
                        <>
                          <span className="font-mono">{row.reps} min</span>
                          {row.speedMph != null && row.speedMph > 0 && (
                            <span> · {row.speedMph} mph</span>
                          )}
                          {row.gradePct != null && row.gradePct > 0 && (
                            <span> · {row.gradePct}% incline</span>
                          )}
                        </>
                      ) : (
                        <>
                          {row.weight} lb × {row.reps}
                        </>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {row.repPR && (
                        <span className="text-[10px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/25">
                          Rep PR
                        </span>
                      )}
                      {row.e1rmPR && (
                        <span className="text-[10px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-md bg-violet-500/15 text-violet-300 border border-violet-500/25">
                          e1RM PR
                        </span>
                      )}
                      {row.speedPR && (
                        <span className="text-[10px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300 border border-sky-500/25">
                          Speed PR
                        </span>
                      )}
                      {row.inclinePR && (
                        <span className="text-[10px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-md bg-teal-500/15 text-teal-300 border border-teal-500/25">
                          Incline PR
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="p-4 pt-2 border-t border-zinc-800 shrink-0 supports-[padding:max(0px)]:pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-12 rounded-2xl bg-amber-500 text-zinc-950 font-semibold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
