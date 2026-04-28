'use client';

import { useEffect } from 'react';
import type { SessionLog } from '@/lib/types';
import type { SessionRecapPRItem } from '@/lib/stats';
import { fmtDurationShort } from '@/lib/stats';
import { effortLabel } from '@/lib/effort';

type Props = {
  open: boolean;
  onClose: () => void;
  session: SessionLog;
  templateName: string;
  durationMs: number | null;
  progression: { advanced: number; held: number; skipped: number };
  prs: SessionRecapPRItem[];
};

function sessionModeLabel(s: SessionLog): string {
  if (s.mode === 'skip') return 'Recovery skip';
  if (s.deload) return 'Deload';
  if (s.mode === 'light') return 'Light day';
  return 'Standard';
}

export function SessionRecapSheet({
  open,
  onClose,
  session,
  templateName,
  durationMs,
  progression,
  prs,
}: Props) {
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
        className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl max-h-[min(90dvh,640px)] flex flex-col"
      >
        <div className="p-5 pb-3 border-b border-zinc-800 shrink-0">
          <h2 id="session-recap-title" className="text-lg font-semibold text-zinc-100">
            Session recap
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            {templateName}
            <span className="text-zinc-600"> · </span>
            {session.date}
            <span className="text-zinc-600"> · </span>
            {sessionModeLabel(session)}
            {effort}
          </p>
          {durationMs != null && (
            <p className="text-xs font-mono text-zinc-500 mt-2">
              {fmtDurationShort(durationMs)}
            </p>
          )}
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
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
                      {row.weight} lb × {row.reps}
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
