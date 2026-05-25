'use client';

import { useMemo, useState } from 'react';
import {
  useAllSessions,
  useAllSets,
  useLifts,
  usePrescriptions,
} from '@/lib/hooks';
import {
  buildQuickPrescriptions,
  QUICK_DEFAULT_LIFT_IDS,
  QUICK_MAX_LIFTS,
  QUICK_MIN_LIFTS,
} from '@/lib/quickSession';
import { liftForSnap, snapWorkingWeight } from '@/lib/progression';
import { localUpsert, flushDirty } from '@/lib/sync';
import {
  finalizeWorkoutPauseAtCompletion,
  fmtDurationShort,
  sessionDurationMs,
  sessionFinishHighlights,
  sessionRecapPRs,
} from '@/lib/stats';
import { todayIso } from '@/lib/time';
import type { Lift, Prescription, SessionLog } from '@/lib/types';
import { LiftCard } from './LiftCard';
import { PageShell } from './PageShell';
import { WorkoutStopwatchBar } from './WorkoutSessionTimer';

const QUICK_SWAP_LIFT_IDS = [
  'dl',
  'back_squat',
  'bp',
  'bp_paused',
  'ohp',
  'pp',
  'bbr',
  'pendlay_row',
  'deficit_bbr',
  'rdl',
  'wgbp',
  'cgbp',
  'p1_bw',
  'p1_eccentric',
  'front_squat',
] as const;

type Props = {
  onBack: () => void;
};

function shiftSetsOverrideDown(
  prev: Record<number, number>,
  removedIndex: number,
): Record<number, number> {
  const next: Record<number, number> = {};
  for (const [key, val] of Object.entries(prev)) {
    const idx = Number(key);
    if (idx < removedIndex) next[idx] = val;
    else if (idx > removedIndex) next[idx - 1] = val;
  }
  return next;
}

function QuickLiftBlock({
  prescription,
  lift,
  session,
  onAddSet,
  extraSets,
}: {
  prescription: Prescription;
  lift: Lift;
  session: SessionLog;
  onAddSet: () => void;
  extraSets: number;
}) {
  const effectivePrescription = {
    ...prescription,
    sets: prescription.sets + extraSets,
  };
  return (
    <div className="space-y-1">
      <LiftCard
        prescription={effectivePrescription}
        lift={lift}
        session={session}
        restTargetSeconds={120}
      />
      <button
        type="button"
        onClick={onAddSet}
        className="w-full h-9 rounded-xl border border-dashed border-zinc-700 text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors"
      >
        + Add set
      </button>
    </div>
  );
}

export function QuickSessionView({ onBack }: Props) {
  const lifts = useLifts();
  const allSets = useAllSets();
  const allSessions = useAllSessions();
  const allPrescriptions = usePrescriptions();

  const [liftIds, setLiftIds] = useState<string[]>(() => [...QUICK_DEFAULT_LIFT_IDS]);
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const [addingSlot, setAddingSlot] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [session, setSession] = useState<SessionLog | null>(null);
  const [finishBusy, setFinishBusy] = useState(false);
  const [recap, setRecap] = useState<{
    prCount: number;
    completedSets: number;
    durationMs: number | null;
  } | null>(null);
  const [setsOverride, setSetsOverride] = useState<Record<number, number>>({});
  const [extraSets, setExtraSets] = useState<Record<string, number>>({});

  const prescriptionFallback = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of allPrescriptions ?? []) {
      m.set(p.liftId, p.weight);
    }
    return m;
  }, [allPrescriptions]);

  const syntheticPrescriptions = useMemo(() => {
    if (!allSets || !allSessions) return [];
    return buildQuickPrescriptions(liftIds, allSets, allSessions, prescriptionFallback);
  }, [liftIds, allSets, allSessions, prescriptionFallback]);

  const liftById = useMemo(() => new Map((lifts ?? []).map((l) => [l.id, l])), [lifts]);

  const displayPrescriptions = useMemo(() => {
    return syntheticPrescriptions.map((p, i) => ({
      ...p,
      sets: setsOverride[i] ?? p.sets,
      weight: snapWorkingWeight(p.weight, liftForSnap(p.liftId)),
    }));
  }, [syntheticPrescriptions, setsOverride]);

  const swapOptions = useMemo(() => {
    const out: Lift[] = [];
    for (const id of QUICK_SWAP_LIFT_IDS) {
      const lift = liftById.get(id);
      if (lift) out.push(lift);
    }
    return out;
  }, [liftById]);

  if (!lifts || !allSets || !allSessions || allPrescriptions === undefined) {
    return <div className="p-6 text-zinc-500">Loading…</div>;
  }

  async function startSession() {
    const row: SessionLog = {
      id: `${todayIso()}-QUICK-${Date.now()}`,
      date: todayIso(),
      templateId: 'QUICK',
      mode: 'standard',
      deload: false,
      sessionType: 'opportunistic',
      watchFlags: [],
      startedAt: new Date().toISOString(),
    };
    await localUpsert('session_logs', row);
    setSession(row);
    setSessionStarted(true);
  }

  async function finishSession() {
    if (!session || !lifts) return;
    setFinishBusy(true);
    try {
      const completedAt = new Date().toISOString();
      const finalSession = {
        ...finalizeWorkoutPauseAtCompletion(session, completedAt),
        completedAt,
      };
      await localUpsert('session_logs', finalSession);
      await flushDirty();
      setSession(finalSession);

      const sessionSets = (allSets ?? []).filter((s) => s.sessionLogId === session.id);
      const highlights = sessionFinishHighlights(finalSession, sessionSets, lifts, [], []);
      const prs = sessionRecapPRs(
        finalSession.id,
        sessionSets,
        allSessions ?? [],
        lifts,
      );
      setRecap({
        prCount: prs.length,
        completedSets: highlights.completedSetCount,
        durationMs: sessionDurationMs(finalSession, sessionSets),
      });
    } finally {
      setFinishBusy(false);
    }
  }

  if (recap) {
    return (
      <PageShell className="p-4 space-y-4">
        <div className="rounded-2xl border border-emerald-500/45 bg-emerald-950/40 p-5 space-y-3">
          <h2 className="text-lg font-semibold text-emerald-100">Quick session complete</h2>
          <ul className="text-sm text-zinc-300 space-y-1">
            <li>
              <span className="text-zinc-500">Sets completed:</span> {recap.completedSets}
            </li>
            <li>
              <span className="text-zinc-500">PRs:</span>{' '}
              {recap.prCount > 0 ? recap.prCount : 'none this session'}
            </li>
            {recap.durationMs != null && (
              <li>
                <span className="text-zinc-500">Duration:</span>{' '}
                <span className="font-mono">{fmtDurationShort(recap.durationMs)}</span>
              </li>
            )}
          </ul>
          <button
            type="button"
            onClick={onBack}
            className="w-full h-12 rounded-xl bg-amber-500 text-zinc-950 font-semibold text-sm"
          >
            Done
          </button>
        </div>
      </PageShell>
    );
  }

  if (!sessionStarted || !session) {
    return (
      <PageShell className="p-4 space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-zinc-400 underline underline-offset-2"
        >
          ← Back
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Quick Session</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Singles or doubles on five compounds — off-program, no progression.
          </p>
          <p className="text-xs text-zinc-600 mt-0.5">
            {liftIds.length} movement{liftIds.length !== 1 ? 's' : ''} · max {QUICK_MAX_LIFTS}
          </p>
        </div>

        <div className="space-y-3">
          {displayPrescriptions.map((p, i) => {
            const lift = liftById.get(p.liftId);
            if (!lift) return null;
            const snapped = snapWorkingWeight(p.weight, liftForSnap(p.liftId));
            const slotSets = p.sets;
            return (
              <div
                key={`quick-prestart-${i}`}
                className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="font-medium text-zinc-100">{lift.name}</div>
                  <div className="text-sm text-zinc-500 mt-0.5">
                    {slotSets}×{p.repMin}–{p.repMax} @ {snapped}
                    {lift.loadUnit === 'lb' ? ' lb' : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setLiftIds((prev) => prev.filter((_, idx) => idx !== i));
                      setSetsOverride((prev) => shiftSetsOverrideDown(prev, i));
                      setSwapIndex((si) => {
                        if (si === null) return null;
                        if (si === i) return null;
                        if (si > i) return si - 1;
                        return si;
                      });
                    }}
                    disabled={liftIds.length <= QUICK_MIN_LIFTS}
                    aria-label={`Remove ${lift.name}`}
                    className="shrink-0 h-9 w-9 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 flex items-center justify-center text-lg disabled:opacity-30 hover:text-rose-400 transition-colors"
                  >
                    −
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setSetsOverride((prev) => ({
                          ...prev,
                          [i]: Math.max(1, (prev[i] ?? p.sets) - 1),
                        }))
                      }
                      disabled={slotSets <= 1}
                      className="h-8 w-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-base flex items-center justify-center disabled:opacity-30"
                    >
                      −
                    </button>
                    <span className="font-mono text-sm text-zinc-200 w-4 text-center">{slotSets}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setSetsOverride((prev) => ({
                          ...prev,
                          [i]: Math.min(5, (prev[i] ?? p.sets) + 1),
                        }))
                      }
                      disabled={slotSets >= 5}
                      className="h-8 w-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-base flex items-center justify-center disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSwapIndex(i)}
                    className="shrink-0 h-9 px-3 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300"
                  >
                    Swap
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {liftIds.length < QUICK_MAX_LIFTS && (
          <button
            type="button"
            onClick={() => setAddingSlot(true)}
            className="w-full h-11 rounded-2xl border border-dashed border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors flex items-center justify-center gap-2"
          >
            <span className="text-lg leading-none">+</span>
            Add movement
          </button>
        )}

        <button
          type="button"
          onClick={() => void startSession()}
          className="w-full h-14 rounded-2xl bg-amber-500 text-zinc-950 font-semibold text-lg"
        >
          Start Quick Session
        </button>

        {swapIndex != null && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:p-4">
            <button
              type="button"
              aria-label="Close"
              className="absolute inset-0 bg-black/70"
              onClick={() => setSwapIndex(null)}
            />
            <div className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-zinc-800 bg-zinc-950 max-h-[70dvh] flex flex-col">
              <div className="p-4 border-b border-zinc-800 shrink-0">
                <h3 className="text-lg font-semibold text-zinc-100">Swap movement</h3>
                <p className="text-xs text-zinc-500 mt-1">Session only — does not change your program.</p>
              </div>
              <div className="overflow-y-auto p-2 divide-y divide-zinc-800">
                {swapOptions.map((lift) => (
                  <button
                    key={lift.id}
                    type="button"
                    onClick={() => {
                      setLiftIds((prev) => {
                        const next = [...prev];
                        next[swapIndex] = lift.id;
                        return next;
                      });
                      setSetsOverride((prev) => {
                        const next = { ...prev };
                        delete next[swapIndex];
                        return next;
                      });
                      setSwapIndex(null);
                    }}
                    className="w-full text-left px-3 py-3 text-sm text-zinc-200 hover:bg-zinc-900 rounded-lg"
                  >
                    {lift.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {addingSlot && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:p-4">
            <button
              type="button"
              aria-label="Close"
              className="absolute inset-0 bg-black/70"
              onClick={() => setAddingSlot(false)}
            />
            <div className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-zinc-800 bg-zinc-950 max-h-[70dvh] flex flex-col">
              <div className="p-4 border-b border-zinc-800 shrink-0">
                <h3 className="text-lg font-semibold text-zinc-100">Add movement</h3>
                <p className="text-xs text-zinc-500 mt-1">Appended to the end of your quick session.</p>
              </div>
              <div className="overflow-y-auto p-2 divide-y divide-zinc-800">
                {swapOptions.map((lift) => (
                  <button
                    key={lift.id}
                    type="button"
                    onClick={() => {
                      setLiftIds((prev) => [...prev, lift.id]);
                      setAddingSlot(false);
                    }}
                    className="w-full text-left px-3 py-3 text-sm text-zinc-200 hover:bg-zinc-900 rounded-lg"
                  >
                    {lift.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </PageShell>
    );
  }

  return (
    <PageShell className="p-4 space-y-4 pb-24">
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-zinc-400 underline underline-offset-2"
      >
        ← Back
      </button>
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Quick Session</h1>
        <p className="text-xs text-zinc-500 mt-1">Opportunistic · no progression</p>
      </div>
      {session.startedAt && !session.completedAt && <WorkoutStopwatchBar session={session} />}

      <div className="space-y-3">
        {displayPrescriptions.map((p) => {
          const lift = liftById.get(p.liftId);
          if (!lift) return null;
          const extra = extraSets[p.liftId] ?? 0;
          return (
            <QuickLiftBlock
              key={p.id}
              prescription={p}
              lift={lift}
              session={session}
              extraSets={extra}
              onAddSet={() =>
                setExtraSets((prev) => ({
                  ...prev,
                  [p.liftId]: (prev[p.liftId] ?? 0) + 1,
                }))
              }
            />
          );
        })}
      </div>

      {!session.completedAt && (
        <button
          type="button"
          disabled={finishBusy}
          onClick={() => void finishSession()}
          className="w-full h-14 rounded-2xl bg-amber-500 text-zinc-950 font-semibold text-lg disabled:opacity-50"
        >
          {finishBusy ? 'Finishing…' : 'Finish Quick Session'}
        </button>
      )}
    </PageShell>
  );
}
