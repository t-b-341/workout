'use client';

import { useEffect, useState } from 'react';
import { flushDirty, localUpsert } from '@/lib/sync';
import { fmtDurationShort, workoutWallClockElapsedMs } from '@/lib/stats';
import type { SessionLog } from '@/lib/types';

export function StartWorkoutButton({
  session,
}: {
  session: SessionLog;
}) {
  const [busy, setBusy] = useState(false);

  async function start() {
    if (session.startedAt || session.completedAt) return;
    setBusy(true);
    try {
      await localUpsert('session_logs', {
        ...session,
        startedAt: new Date().toISOString(),
      });
      await flushDirty().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-amber-500/35 bg-gradient-to-br from-amber-950/60 to-zinc-900 p-4 shadow-lg shadow-amber-950/10">
      <div className="text-sm font-medium text-zinc-100 mb-1">Ready to lift?</div>
      <p className="text-xs text-zinc-500 mb-3">
        Starts the session stopwatch (wall time until you finish). Your first logged set also starts the timer if you haven&apos;t pressed this yet.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void start()}
        className="w-full h-12 rounded-xl bg-amber-500 text-zinc-950 font-semibold text-base disabled:opacity-50"
      >
        {busy ? 'Starting…' : 'Start workout'}
      </button>
    </div>
  );
}

export function WorkoutStopwatchBar({ session }: { session: SessionLog }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!session.startedAt || session.completedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [session.startedAt, session.completedAt]);

  const elapsed = workoutWallClockElapsedMs(session, now);
  if (elapsed == null) return null;

  return (
    <div
      role="timer"
      aria-live="polite"
      aria-label={`Workout time elapsed ${fmtDurationShort(elapsed)}`}
      className="sticky top-0 z-30 -mx-4 px-4 py-2.5 border-b border-amber-500/25 bg-zinc-950/95 backdrop-blur-md supports-[backdrop-filter]:bg-zinc-950/85"
    >
      <div className="flex items-center justify-between gap-3 max-w-lg mx-auto">
        <span className="text-xs uppercase tracking-wider text-zinc-500">Session</span>
        <span className="font-mono text-xl tabular-nums text-amber-400">{fmtDurationShort(elapsed)}</span>
      </div>
    </div>
  );
}
