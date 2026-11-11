'use client';

import { useEffect, useState } from 'react';
import { ensureSessionPersisted, flushDirty, persistSessionUpdate } from '@/lib/sync';
import { fmtDurationShort, workoutWallClockElapsedMs } from '@/lib/stats';
import type { SessionLog } from '@/lib/types';

async function pauseWorkout(session: SessionLog) {
  const stored = await ensureSessionPersisted(session);
  if (stored.completedAt || !stored.startedAt || stored.workoutPausedAt) return;
  await persistSessionUpdate(stored, { workoutPausedAt: new Date().toISOString() });
  await flushDirty().catch(() => {});
}

async function resumeWorkout(session: SessionLog) {
  const stored = await ensureSessionPersisted(session);
  if (!stored.workoutPausedAt) return;
  const p = Date.parse(stored.workoutPausedAt);
  const patch = Number.isNaN(p)
    ? { workoutPausedAt: undefined }
    : {
        workoutPausedAccumMs: (stored.workoutPausedAccumMs ?? 0) + Math.max(0, Date.now() - p),
        workoutPausedAt: undefined,
      };
  await persistSessionUpdate(stored, patch);
  await flushDirty().catch(() => {});
}

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
      const stored = await ensureSessionPersisted(session);
      if (stored.startedAt || stored.completedAt) return;
      await persistSessionUpdate(stored, { startedAt: new Date().toISOString() });
      await flushDirty().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-amber-500/35 bg-gradient-to-br from-amber-950/60 to-zinc-900 p-4 shadow-lg shadow-amber-950/10">
      <div className="text-sm font-medium text-zinc-100 mb-3">Ready to lift?</div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void start()}
        className="w-full h-12 rounded-xl bg-amber-500 text-zinc-950 font-semibold text-base disabled:opacity-50"
      >
        {busy ? 'Starting…' : 'Start workout'}
      </button>
      <p className="text-xs text-zinc-500 mt-3">
        Starts the session stopwatch (active time until you finish — use Pause on the timer bar for breaks).
        Your first logged set also starts the timer if you haven&apos;t pressed this yet.
      </p>
    </div>
  );
}

export function WorkoutStopwatchBar({ session }: { session: SessionLog }) {
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  const paused = Boolean(session.workoutPausedAt);

  useEffect(() => {
    if (!session.startedAt || session.completedAt || paused) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [session.startedAt, session.completedAt, paused]);

  const elapsed = workoutWallClockElapsedMs(session, now);
  if (elapsed == null) return null;

  return (
    <div
      role="timer"
      aria-live="polite"
      aria-label={
        paused
          ? `Workout paused at ${fmtDurationShort(elapsed)}`
          : `Workout time elapsed ${fmtDurationShort(elapsed)}`
      }
      className="sticky top-0 z-30 -mx-4 px-4 py-2.5 border-b border-amber-500/25 bg-zinc-950/95 backdrop-blur-md supports-[backdrop-filter]:bg-zinc-950/85"
    >
      <div className="flex items-center justify-between gap-2 sm:gap-3 max-w-lg mx-auto">
        <span className="text-xs uppercase tracking-wider text-zinc-500 shrink-0">Session</span>
        <span
          className={`font-mono text-xl tabular-nums shrink-0 ${paused ? 'text-zinc-500' : 'text-amber-400'}`}
        >
          {fmtDurationShort(elapsed)}
        </span>
        {!paused ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void pauseWorkout(session).finally(() => {
                setBusy(false);
                setNow(Date.now());
              });
            }}
            className="shrink-0 h-9 px-3 rounded-xl bg-zinc-800 text-zinc-100 text-xs font-semibold disabled:opacity-50 border border-zinc-700"
          >
            Pause
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void resumeWorkout(session).finally(() => {
                setBusy(false);
                setNow(Date.now());
              });
            }}
            className="shrink-0 h-9 px-3 rounded-xl bg-amber-500 text-zinc-950 text-xs font-semibold disabled:opacity-50"
          >
            Resume
          </button>
        )}
      </div>
      {paused && (
        <div className="max-w-lg mx-auto mt-1 text-[11px] text-center text-zinc-500">Timer paused</div>
      )}
    </div>
  );
}
