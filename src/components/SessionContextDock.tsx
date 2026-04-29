'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Prescription, SessionLog, SetLog } from '@/lib/types';
import { fmtDurationShort, sessionDurationMs, workoutWallClockElapsedMs } from '@/lib/stats';
import {
  expectedSetSlots,
  firstOpenPrescriptionId,
  lastLoggedAtInSession,
  sessionSetsForPrescriptions,
} from '@/lib/todaySessionUi';
import { pageMaxClass, useLayoutMode } from '@/lib/layoutMode';
import { RestTimer } from './RestTimer';

type Props = {
  session: SessionLog;
  prescriptions: Prescription[];
  allSets: SetLog[];
};

export function SessionContextDock({ session, prescriptions, allSets }: Props) {
  const { mode } = useLayoutMode();
  const [tick, setTick] = useState(0);
  const maxInner = pageMaxClass(mode);

  const sessionSets = useMemo(
    () => sessionSetsForPrescriptions(session.id, prescriptions, allSets),
    [session.id, prescriptions, allSets],
  );

  const total = expectedSetSlots(prescriptions);
  const done = sessionSets.length;
  const openPid = firstOpenPrescriptionId(prescriptions, sessionSets);
  const lastLog = lastLoggedAtInSession(sessionSets);
  const inProgress = !!session.startedAt && !session.completedAt;

  useEffect(() => {
    if (!inProgress) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [inProgress]);

  void tick;

  const durationMs = inProgress
    ? workoutWallClockElapsedMs(session, Date.now())
    : sessionDurationMs(session, sessionSets);

  function jumpToCurrent() {
    if (!openPid) return;
    const el = document.getElementById(`lift-${openPid}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (session.completedAt) return null;
  if (prescriptions.length === 0) return null;

  const showRest = inProgress && lastLog && openPid;

  return (
    <div
      className={`fixed inset-x-0 z-30 pointer-events-none bottom-[calc(4rem+max(env(safe-area-inset-bottom),0px))]`}
    >
      <div className={`${maxInner} mx-auto px-4 pointer-events-auto`}>
        <div className="flex items-center gap-2 rounded-2xl border border-zinc-700/90 bg-zinc-900/95 px-3 py-2 shadow-lg backdrop-blur-sm">
          <div className="min-w-0 flex-1 text-xs text-zinc-300 space-y-0.5">
            <div className="font-mono text-zinc-100">
              {done}/{total} sets
              {durationMs != null && inProgress && (
                <span className="text-zinc-500 font-sans">
                  {' '}
                  · {fmtDurationShort(durationMs)}
                </span>
              )}
            </div>
            {showRest && (
              <div className="text-zinc-500">
                <RestTimer since={lastLog} label="Since log" />
              </div>
            )}
          </div>
          {openPid && (
            <button
              type="button"
              onClick={jumpToCurrent}
              className="shrink-0 h-10 px-3 rounded-xl bg-amber-500/90 text-zinc-950 text-sm font-semibold"
            >
              Jump
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
