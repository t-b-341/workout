'use client';

import { useState } from 'react';
import { recommendMode } from '@/lib/recommendMode';
import { ReadinessEditForm } from './ReadinessForm';
import type { ReadinessLog, SessionLog } from '@/lib/types';

/** Color thresholds mirror `recommendMode()` in `recommendMode.ts` so the chips
 *  visually agree with the suggested mode. */
function sleepTone(h: number): string {
  if (h < 5) return 'bg-rose-900/60 text-rose-200';
  if (h < 7) return 'bg-amber-900/60 text-amber-200';
  return 'bg-emerald-900/50 text-emerald-200';
}
function sorenessTone(n: number): string {
  if (n >= 4) return 'bg-rose-900/60 text-rose-200';
  if (n === 3) return 'bg-amber-900/60 text-amber-200';
  return 'bg-emerald-900/50 text-emerald-200';
}
function motivationTone(n: number): string {
  if (n <= 1) return 'bg-rose-900/60 text-rose-200';
  if (n <= 2) return 'bg-amber-900/60 text-amber-200';
  return 'bg-emerald-900/50 text-emerald-200';
}

function modeColor(mode: 'standard' | 'light' | 'skip'): string {
  return mode === 'standard'
    ? 'text-emerald-400'
    : mode === 'light'
      ? 'text-amber-400'
      : 'text-rose-400';
}
function modeLabel(mode: 'standard' | 'light' | 'skip'): string {
  return mode === 'standard' ? 'Standard' : mode === 'light' ? 'Light' : 'Skip';
}

export function ReadinessSummary({
  readiness,
  dense,
  session,
  allowEdit,
}: {
  readiness: ReadinessLog;
  dense?: boolean;
  /** When set with `allowEdit`, shows an edit flow for today’s check-in. */
  session?: SessionLog;
  allowEdit?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const canEdit = Boolean(allowEdit && session && !dense);

  if (canEdit && editing && session) {
    return (
      <ReadinessEditForm
        key={`${readiness.id}-${readiness.sleepHours}-${readiness.soreness}-${readiness.motivation}`}
        readiness={readiness}
        session={session}
        onDone={() => setEditing(false)}
      />
    );
  }

  const rec = recommendMode(readiness.sleepHours, readiness.soreness, readiness.motivation, {
    hrvRmssd: readiness.hrvRmssd,
    hrvSkipped: readiness.hrvSkipped,
  });
  const chipBase = dense
    ? 'px-2 py-0.5 rounded-md text-[11px] font-mono'
    : 'px-2.5 py-1 rounded-lg text-xs font-mono';

  const chips = (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`${chipBase} ${sleepTone(readiness.sleepHours)}`}>
        sleep {readiness.sleepHours}h
      </span>
      <span className={`${chipBase} ${sorenessTone(readiness.soreness)}`}>
        soreness {readiness.soreness}/5
      </span>
      <span className={`${chipBase} ${motivationTone(readiness.motivation)}`}>
        motivation {readiness.motivation}/5
      </span>
      {readiness.bodyweight != null && (
        <span className={`${chipBase} bg-zinc-800 text-zinc-300`}>
          bw {readiness.bodyweight}
        </span>
      )}
      {readiness.hrvSkipped ? (
        <span className={`${chipBase} bg-zinc-800 text-zinc-400`}>
          hrv skipped
        </span>
      ) : readiness.hrvRmssd != null ? (
        <span className={`${chipBase} bg-sky-900/40 text-sky-200`}>
          hrv {readiness.hrvRmssd}
        </span>
      ) : null}
    </div>
  );

  if (dense) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {chips}
        <span className={`text-[11px] ${modeColor(rec.mode)}`}>
          → {modeLabel(rec.mode)}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-3">
      <div className="flex items-center justify-between gap-2">
        <details className="group flex-1 min-w-0">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs uppercase tracking-wider text-zinc-500">Readiness</span>
              <span className={`text-xs ${modeColor(rec.mode)}`}>{modeLabel(rec.mode)}</span>
            </div>
            <span className="text-xs text-zinc-500 group-open:hidden shrink-0">tap to expand</span>
          </summary>
          <div className="mt-3 space-y-2">
            {chips}
            <div className="text-xs text-zinc-500">{rec.reason}</div>
          </div>
        </details>
        {canEdit && (
          <button
            type="button"
            className="text-xs text-amber-500 hover:text-amber-400 shrink-0 py-1"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        )}
      </div>
    </div>
  );
}
