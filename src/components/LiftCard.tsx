'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useAllBodyweight,
  useAllReadiness,
  useAllSessions,
  useAllSets,
  useLastSessionsForLift,
  useLifts,
  useReadinessForSession,
  useSetsForSession,
} from '@/lib/hooks';
import { localDelete, localUpsert } from '@/lib/sync';
import type {
  CardioLog,
  CardioType,
  Lift,
  Prescription,
  SessionLog,
  SetIntent,
  SetLog,
  SetStatus,
} from '@/lib/types';
import { SET_INTENTS } from '@/lib/types';
import { DecimalStepper, RepStepper, RirStepper, WeightStepper } from './WeightStepper';
import { fmtDate } from '@/lib/time';
import { platesPerSide } from '@/lib/plates';
import { snapWorkingWeight } from '@/lib/progression';
import { bodyweightLbForSessionVolume } from '@/lib/p1AssistedVolume';
import { detectPR, detectLissIntensityPR, est1RM } from '@/lib/stats';
import { RestTimer } from './RestTimer';
import { rpeFromRir, shouldTrackRpeForReps } from '@/lib/rpe';
import { resolveCardioTimestamps } from '@/lib/cardioTime';

type Props = {
  prescription: Prescription;
  lift: Lift;
  session: SessionLog;
  /** Emphasize when this lift is pinned on Program / lift detail. */
  pinned?: boolean;
  effectiveSets?: number;
  onAddSet?: () => void;
  onRemoveLastSet?: () => void;
};

export type CardioSetMeta = {
  speedMph?: number;
  gradePct?: number;
  avgHr?: number;
  peakHr?: number;
  /** Set when "Start workout cardio" is pressed; used for `cardio_logs.startedAt`. */
  timerStartedAt?: string;
};

const STATUS_LABEL: Record<SetStatus, string> = {
  completed: 'Done',
  reduced: 'Reduced',
  skipped: 'Skipped',
  substituted: 'Substituted',
};

const STATUS_COLOR: Record<SetStatus, string> = {
  completed: 'bg-emerald-600',
  reduced: 'bg-amber-600',
  skipped: 'bg-zinc-600',
  substituted: 'bg-indigo-600',
};

const INTENT_LABEL: Record<SetIntent, string> = {
  warmup: 'Warmup',
  working: 'Working',
  backoff: 'Backoff',
  max_test: 'PR / max test',
  skipped: 'Skipped',
};

function getPriorBestE1rm(
  liftId: string,
  currentSessionId: string,
  allSets: SetLog[] | undefined,
): number {
  if (!allSets?.length) return 0;
  let best = 0;
  for (const s of allSets) {
    if (s.liftId !== liftId || s.sessionLogId === currentSessionId) continue;
    if (s.status !== 'completed') continue;
    const e = est1RM(s.weight, s.reps);
    if (Number.isFinite(e)) best = Math.max(best, e);
  }
  return best;
}

export function LiftCard({
  prescription,
  lift,
  session,
  pinned,
  effectiveSets,
  onAddSet,
  onRemoveLastSet,
}: Props) {
  const sets = useSetsForSession(session.id);
  const history = useLastSessionsForLift(prescription.liftId, 3);
  const lifts = useLifts();
  const allSets = useAllSets();
  const allSessions = useAllSessions();
  const readinessRow = useReadinessForSession(session.id);
  const allBodyweight = useAllBodyweight();
  const allReadiness = useAllReadiness();
  const p1BwAnchor = useMemo(
    () =>
      prescription.liftId === 'p1_assisted'
        ? bodyweightLbForSessionVolume(session, readinessRow, allBodyweight ?? [])
        : undefined,
    [prescription.liftId, session, readinessRow, allBodyweight],
  );
  const [openSubs, setOpenSubs] = useState<number | null>(null);
  const [reasonDraft, setReasonDraft] = useState('');
  const [substituteId, setSubstituteId] = useState<string>('');
  const [pendingIntentByKey, setPendingIntentByKey] = useState<Record<string, SetIntent>>({});

  const liftSets = (sets ?? []).filter((s) => s.prescriptionId === prescription.id);
  const setCount = effectiveSets ?? prescription.sets;
  const indexes = Array.from({ length: setCount }, (_, i) => i);
  const sides: Array<'L' | 'R' | undefined> = prescription.perSide ? ['L', 'R'] : [undefined];

  const lastSession = history?.[0];

  const repUnitLabel = lift.repUnit === 'seconds' ? 'sec'
    : lift.repUnit === 'minutes' ? 'min'
    : lift.repUnit === 'lengths' ? 'len'
    : 'reps';

  const isCardio = lift.equipment === 'cardio';
  const defaultIntent: SetIntent = session.sessionType === 'pr_test' ? 'max_test' : 'working';

  // Most recent loggedAt for THIS lift in THIS session — feeds the rest timer
  // shown above the next un-logged set row.
  const mostRecentLogTs = useMemo(() => {
    return liftSets
      .map((s) => s.loggedAt)
      .filter((x): x is string => !!x)
      .sort()
      .pop();
  }, [liftSets]);

  // PR check: at log time we want to know whether the just-saved set beat
  // the all-time best at that rep count, EXCLUDING the saved row itself.
  function prFor(set: SetLog | undefined) {
    if (!set || !allSets || !allSessions) return null;
    const prior = allSets.filter((s) => s.id !== set.id);
    return detectPR(set, set.liftId, prior, allSessions, allBodyweight ?? undefined, allReadiness ?? undefined);
  }

  function lissIntensityPrFor(set: SetLog | undefined) {
    if (!set || !allSets) return null;
    if (set.liftId !== 'liss') return null;
    const prior = allSets.filter((s) => s.id !== set.id);
    return detectLissIntensityPR(set, prior);
  }

  function getSet(setIndex: number, side?: 'L' | 'R'): SetLog | undefined {
    // Treat null and undefined as the same "no side" — older synced rows may
    // have side: null from Postgres while local writes use undefined.
    return liftSets.find(
      (s) => s.setIndex === setIndex && (s.side ?? undefined) === side,
    );
  }

  function intentKey(setIndex: number, side?: 'L' | 'R') {
    return `${setIndex}-${side ?? 'X'}`;
  }

  async function setIntentChoice(setIndex: number, side: 'L' | 'R' | undefined, nextIntent: SetIntent) {
    const existing = getSet(setIndex, side);
    const k = intentKey(setIndex, side);
    if (!existing) {
      setPendingIntentByKey((prev) => ({ ...prev, [k]: nextIntent }));
      return;
    }
    await localUpsert('set_logs', { ...existing, intent: nextIntent });
  }

  function intentFor(setIndex: number, side?: 'L' | 'R'): SetIntent {
    const existing = getSet(setIndex, side);
    const k = intentKey(setIndex, side);
    return pendingIntentByKey[k] ?? existing?.intent ?? defaultIntent;
  }

  async function logSet(args: {
    setIndex: number;
    side?: 'L' | 'R';
    weight: number;
    reps: number;
    rir?: number;
    status?: SetStatus;
    substituteLiftId?: string;
    reason?: string;
    cardioMeta?: CardioSetMeta;
  }) {
    const existing = getSet(args.setIndex, args.side);
    const id = existing?.id ?? `${session.id}-${prescription.id}-${args.setIndex}-${args.side ?? 'X'}`;
    const status = args.status ?? 'completed';
    const weight = snapWorkingWeight(args.weight, lift);
    const ctForRow = liftToCardioType(lift.id);
    const k = intentKey(args.setIndex, args.side);
    const intent = pendingIntentByKey[k] ?? existing?.intent ?? defaultIntent;
    const row: SetLog = {
      id,
      sessionLogId: session.id,
      liftId: prescription.liftId,
      prescriptionId: prescription.id,
      setIndex: args.setIndex,
      intent,
      weight,
      reps: args.reps,
      prescribedRepMin: prescription.repMin,
      prescribedRepMax: prescription.repMax,
      rir: shouldTrackRpeForReps(args.reps) && args.rir != null ? args.rir : undefined,
      rpe: shouldTrackRpeForReps(args.reps) && args.rir != null ? rpeFromRir(args.rir) : undefined,
      status,
      substituteLiftId: args.substituteLiftId,
      reason: args.reason,
      side: args.side,
      loggedAt: new Date().toISOString(),
      ...(isCardio && ctForRow === 'liss' && status === 'completed'
        ? {
            speedMph: args.cardioMeta?.speedMph,
            gradePct: args.cardioMeta?.gradePct,
          }
        : {}),
    };
    await localUpsert('set_logs', row);
    setPendingIntentByKey((prev) => {
      if (!(k in prev)) return prev;
      const next = { ...prev };
      delete next[k];
      return next;
    });

    // Stamp session start on first interaction.
    if (!session.startedAt) {
      await localUpsert('session_logs', { ...session, startedAt: row.loggedAt });
    }

    // Cardio lifts mirror to cardio_logs so the weekly 150-min rollup sees them.
    if (isCardio) {
      const cardioId = `cardio-${session.id}-${prescription.id}-${args.setIndex}`;
      if (status === 'completed') {
        const ct = liftToCardioType(lift.id);
        const { startedAt, endedAt } = resolveCardioTimestamps(
          row.loggedAt!,
          args.reps,
          args.cardioMeta?.timerStartedAt,
        );
        const cardioRow: CardioLog = {
          id: cardioId,
          sessionLogId: session.id,
          date: session.date,
          type: ct,
          durationMin: args.reps,
          startedAt,
          endedAt,
          notes: prescription.notes,
          ...(ct === 'liss'
            ? {
                speedMph: args.cardioMeta?.speedMph,
                gradePct: args.cardioMeta?.gradePct,
              }
            : {
                avgHr: args.cardioMeta?.avgHr,
                peakHr: args.cardioMeta?.peakHr,
              }),
        };
        await localUpsert('cardio_logs', cardioRow);
      } else {
        await localDelete('cardio_logs', cardioId, { undoLabel: 'Timer cardio' });
      }
    }
  }

  // Identify whether the next unlogged set should show a rest timer (based
  // on the most recent loggedAt for this lift).
  let nextUnloggedKey: string | null = null;
  for (const idx of indexes) {
    for (const side of sides) {
      const key = `${idx}-${side ?? 'X'}`;
      if (!getSet(idx, side)) {
        nextUnloggedKey = key;
        break;
      }
    }
    if (nextUnloggedKey) break;
  }

  return (
    <div id={`lift-${prescription.id}`} className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3 scroll-mt-24">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex items-start gap-2">
          {pinned && (
            <span className="text-amber-400 text-sm shrink-0 mt-0.5 select-none" title="Pinned lift" aria-hidden>
              ★
            </span>
          )}
          <div className="min-w-0">
          <div className="font-semibold text-zinc-100">{lift.name}</div>
          <div className="text-xs text-zinc-400 mt-0.5">
            <span className="font-mono">{prescription.weight}</span>
            <span className="text-zinc-600"> × </span>
            <span className="font-mono">{prescription.sets}</span>
            <span className="text-zinc-600"> × </span>
            <span className="font-mono">
              {prescription.repMin === prescription.repMax
                ? prescription.repMax
                : `${prescription.repMin}–${prescription.repMax}`}
            </span>
            {prescription.tempo && <span className="text-zinc-500"> · {prescription.tempo}</span>}
            {prescription.perSide && <span className="text-zinc-500"> · per side</span>}
          </div>
          {prescription.notes && (
            <div className="text-xs text-zinc-500 mt-1">{prescription.notes}</div>
          )}
          {isCardio && (
            <div className="text-[11px] text-zinc-500 mt-2 rounded-lg bg-zinc-950/80 border border-zinc-800 px-2 py-1.5">
              <span className="text-zinc-400">Rest totals:</span> logged cardio minutes are subtracted from
              &quot;rest between sets&quot; so treadmill/bike time isn&apos;t counted as rest. Use the timer,
              then set speed / incline (LISS) or HR (intervals).
            </div>
          )}
          {lift.equipment === 'barbell' && prescription.weight > 0 && (() => {
            const plates = platesPerSide(prescription.weight);
            return plates ? (
              <div className="text-xs text-zinc-500 mt-1">Plates/side: <span className="font-mono">{plates}</span></div>
            ) : null;
          })()}
        </div>
        </div>
      </div>

      {lastSession && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-950/40 px-2.5 py-1 text-[11px] text-emerald-100/90">
            <span className="text-emerald-400/80 uppercase tracking-wide text-[10px]">Last time</span>
            <span className="font-mono">
              {lastSession.sets.map((s) => `${s.weight}×${s.reps}`).join(' · ')}
            </span>
            <span className="text-emerald-200/50">· {fmtDate(lastSession.session.date, 'MMM d')}</span>
          </span>
        </div>
      )}

      <WarmupSection lift={lift} />

      <div className="space-y-2">
        {indexes.map((idx) =>
          sides.map((side) => {
            const existing = getSet(idx, side);
            const isDone = !!existing && existing.status !== 'skipped';
            const key = `${idx}-${side ?? 'X'}`;
            const isNextUnlogged = key === nextUnloggedKey;
            const pr = prFor(existing);
            const lip = lissIntensityPrFor(existing);
            return (
              <div key={key} className="space-y-1">
                {isNextUnlogged && mostRecentLogTs && (
                  <div className="px-1">
                    <RestTimer since={mostRecentLogTs} />
                  </div>
                )}
                <div
                  className={`rounded-xl border ${existing ? 'border-zinc-700 bg-zinc-950' : 'border-zinc-800 bg-zinc-900'} p-3`}
                >
                  <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                    <div className="text-sm text-zinc-300 font-medium">
                      Set {idx + 1}{side ? ` · ${side}` : ''}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {pr?.repPR && (
                        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500 text-zinc-950 font-semibold">
                          PR{pr.previousAtReps != null ? ` · was ${pr.previousAtReps}` : ''}
                        </span>
                      )}
                      {lip?.speedPR && (
                        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-500 text-zinc-950 font-semibold">
                          Speed PR
                        </span>
                      )}
                      {lip?.inclinePR && (
                        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-400 text-zinc-950 font-semibold">
                          Incline PR
                        </span>
                      )}
                      {pr?.e1rmPR && !pr?.repPR && existing && (() => {
                        const newE1rm = Math.round(est1RM(existing.weight, existing.reps));
                        const priorBestE1rm = getPriorBestE1rm(lift.id, session.id, allSets);
                        return (
                          <span className="text-[10px] tracking-wider px-2 py-0.5 rounded-full bg-amber-700 text-amber-100 font-semibold inline-flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
                            {priorBestE1rm <= 0 ? (
                              <>
                                <span className="uppercase">e1RM PR</span>
                                <span>·</span>
                                <span className="font-mono font-semibold">{newE1rm} lb</span>
                                <span className="text-amber-200 font-normal normal-case">(first recorded)</span>
                              </>
                            ) : (
                              <>
                                <span className="uppercase">e1RM PR</span>
                                <span className="font-mono font-semibold">{newE1rm} lb</span>
                                <span className="text-amber-200 font-normal normal-case">
                                  ↑ +{newE1rm - Math.round(priorBestE1rm)} lb
                                </span>
                              </>
                            )}
                          </span>
                        );
                      })()}
                      {existing && (
                        <span className={`text-xs px-2 py-0.5 rounded-full text-white ${STATUS_COLOR[existing.status]}`}>
                          {STATUS_LABEL[existing.status]}
                        </span>
                      )}
                    </div>
                  </div>

                  <SetRow
                    prescription={prescription}
                    lift={lift}
                    isCardio={isCardio}
                    repUnitLabel={repUnitLabel}
                    initialWeight={existing?.weight ?? prescription.weight}
                    initialReps={existing?.reps ?? prescription.repMin}
                    initialRir={existing?.rir}
                    initialSpeedMph={existing?.speedMph ?? 2}
                    initialGradePct={existing?.gradePct ?? 3}
                    bodyweightLb={p1BwAnchor}
                    onSave={(weight, reps, rir, status, cardioMeta) =>
                      logSet({ setIndex: idx, side, weight, reps, rir, status, cardioMeta })
                    }
                    done={isDone}
                  />

                  {existing?.status === 'completed' &&
                    (existing.intent === 'working' || existing.intent === 'backoff') && (
                    <div className="flex gap-1 mt-1">
                      {(['fast', 'normal', 'slow'] as const).map((speed) => (
                        <button
                          key={speed}
                          type="button"
                          onClick={async () => {
                            await localUpsert('set_logs', {
                              ...existing,
                              barSpeed: existing.barSpeed === speed ? null : speed,
                            });
                          }}
                          className={`flex-1 h-6 rounded text-[10px] border transition-colors ${
                            existing.barSpeed === speed
                              ? speed === 'fast'
                                ? 'bg-emerald-800 border-emerald-700 text-emerald-200'
                                : speed === 'slow'
                                  ? 'bg-rose-900 border-rose-800 text-rose-200'
                                  : 'bg-zinc-700 border-zinc-600 text-zinc-200'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-600 hover:text-zinc-400'
                          }`}
                        >
                          {speed === 'fast'
                            ? '⚡ Fast'
                            : speed === 'normal'
                              ? '→ Normal'
                              : '↓ Slow'}
                        </button>
                      ))}
                    </div>
                  )}

                  <label className="mt-3 block text-xs text-zinc-500">
                    Set intent
                    <select
                      className="mt-1 block w-full max-w-xs h-9 rounded-lg bg-zinc-950 border border-zinc-800 px-2 text-sm text-zinc-200"
                      aria-label={`Intent for set ${idx + 1}`}
                      value={intentFor(idx, side)}
                      onChange={(e) => void setIntentChoice(idx, side, e.target.value as SetIntent)}
                    >
                      {SET_INTENTS.map((it) => (
                        <option key={it} value={it}>
                          {INTENT_LABEL[it]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex gap-2 mt-2 text-xs">
                    <button
                      onClick={() => setOpenSubs(openSubs === idx ? null : idx)}
                      className="text-zinc-400 underline underline-offset-2"
                    >
                      {openSubs === idx ? 'Cancel' : 'Modify…'}
                    </button>
                  </div>

                  {openSubs === idx && (
                    <div className="mt-3 space-y-2 border-t border-zinc-800 pt-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={async () => {
                            await logSet({ setIndex: idx, side, weight: 0, reps: 0, status: 'skipped', reason: reasonDraft || undefined });
                            setOpenSubs(null);
                            setReasonDraft('');
                          }}
                          className="px-3 h-9 rounded-lg bg-zinc-700 text-sm"
                        >Skip set</button>
                        <button
                          onClick={async () => {
                            await logSet({ setIndex: idx, side, weight: existing?.weight ?? prescription.weight, reps: existing?.reps ?? 0, status: 'reduced', reason: reasonDraft || undefined });
                            setOpenSubs(null);
                            setReasonDraft('');
                          }}
                          className="px-3 h-9 rounded-lg bg-amber-700 text-sm"
                        >Mark reduced</button>
                        <select
                          aria-label="Substitute lift"
                          value={substituteId}
                          onChange={(e) => setSubstituteId(e.target.value)}
                          className="px-2 h-9 rounded-lg bg-zinc-800 text-sm flex-1 min-w-[140px]"
                        >
                          <option value="">Substitute lift…</option>
                          {(lifts ?? []).filter((l) => l.id !== lift.id).map((l) => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                        <button
                          disabled={!substituteId}
                          onClick={async () => {
                            await logSet({
                              setIndex: idx, side,
                              weight: existing?.weight ?? prescription.weight,
                              reps: existing?.reps ?? 0,
                              status: 'substituted',
                              substituteLiftId: substituteId,
                              reason: reasonDraft || undefined,
                            });
                            setOpenSubs(null);
                            setSubstituteId('');
                            setReasonDraft('');
                          }}
                          className="px-3 h-9 rounded-lg bg-indigo-700 text-sm disabled:opacity-50"
                        >Apply sub</button>
                      </div>
                      <input
                        placeholder="Reason (optional) — e.g., knee bothered me"
                        value={reasonDraft}
                        onChange={(e) => setReasonDraft(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg bg-zinc-800 text-sm"
                      />
                      {existing?.reason && (
                        <div className="text-xs text-zinc-500">Current reason: {existing.reason}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          }),
        )}
      </div>

      {(onAddSet || onRemoveLastSet) && (
        <div className="flex items-center gap-2 pt-2 mt-2 border-t border-zinc-800">
          <span className="text-xs text-zinc-500 flex-1">Sets: {setCount}</span>
          {onRemoveLastSet && setCount > 1 && (
            <button
              type="button"
              onClick={onRemoveLastSet}
              className="h-8 px-3 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-400 hover:text-rose-400 transition-colors"
            >
              − Remove last set
            </button>
          )}
          {onAddSet && setCount < 8 && (
            <button
              type="button"
              onClick={onAddSet}
              className="h-8 px-3 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-400 hover:text-amber-400 transition-colors"
            >
              + Add set
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function liftToCardioType(liftId: string): CardioType {
  return liftId.includes('interval') ? 'intervals' : 'liss';
}

function WarmupSection({ lift }: { lift: Lift }) {
  const isStrength = lift.equipment !== 'cardio' && lift.equipment !== 'time';
  const [startedAtIso, setStartedAtIso] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAtIso) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAtIso]);

  const elapsedSec = startedAtIso
    ? Math.max(0, Math.floor((nowMs - Date.parse(startedAtIso)) / 1000))
    : 0;
  const min = Math.floor(elapsedSec / 60);
  const sec = elapsedSec % 60;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-zinc-200">Warmup</div>
        <span className="font-mono text-xs text-zinc-500">
          {min}:{sec.toString().padStart(2, '0')}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {!startedAtIso ? (
          <button
            type="button"
            className="h-9 px-3 rounded-lg bg-emerald-600 text-zinc-950 text-xs font-semibold"
            onClick={() => setStartedAtIso(new Date().toISOString())}
          >
            Start warmup
          </button>
        ) : (
          <button
            type="button"
            className="h-9 px-3 rounded-lg bg-zinc-700 text-xs"
            onClick={() => setStartedAtIso(null)}
          >
            Stop timer
          </button>
        )}
        <button
          type="button"
          className="h-9 px-3 rounded-lg bg-zinc-800 text-xs"
          onClick={() => {
            setStartedAtIso(null);
            setNowMs(Date.now());
          }}
        >
          Reset timer
        </button>
      </div>

      {!isStrength && (
        <div className="text-xs text-zinc-500">
          Use this timer for ramp-up/cardio prep before logging working sets.
        </div>
      )}
    </div>
  );
}

function CardioDurationTimer({
  startedAtIso,
  onStartedAtChange,
  onApplyMinutes,
}: {
  startedAtIso: string | null;
  onStartedAtChange: (iso: string | null) => void;
  onApplyMinutes: (minutes: number) => void;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAtIso) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAtIso]);

  const elapsedSec = startedAtIso
    ? Math.max(0, Math.floor((nowMs - Date.parse(startedAtIso)) / 1000))
    : 0;
  const m = Math.floor(elapsedSec / 60);
  const s = elapsedSec % 60;

  return (
    <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/25 px-3 py-2 space-y-2">
      <div className="text-[11px] font-medium text-emerald-200/90">Session cardio timer</div>
      {!startedAtIso ? (
        <button
          type="button"
          className="w-full h-10 rounded-lg bg-emerald-600 text-zinc-950 text-sm font-semibold"
          onClick={() => onStartedAtChange(new Date().toISOString())}
        >
          Start workout cardio
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <span className="font-mono text-xl tabular-nums text-emerald-400">
            {m}:{s.toString().padStart(2, '0')}
          </span>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              className="h-9 px-3 rounded-lg bg-zinc-700 text-sm"
              onClick={() => onStartedAtChange(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="h-9 px-3 rounded-lg bg-emerald-600 text-zinc-950 text-sm font-semibold"
              onClick={() => {
                const min = Math.max(1, Math.round(elapsedSec / 60));
                onApplyMinutes(min);
              }}
            >
              Apply minutes
            </button>
          </div>
        </div>
      )}
      <p className="text-[10px] text-zinc-500 leading-snug">
        Apply updates the minutes field only; the timer keeps running until you log the set, cancel, or finish this set. End time is set when you tap Log cardio.
      </p>
    </div>
  );
}

function SetRow({
  prescription,
  lift,
  isCardio,
  repUnitLabel,
  initialWeight,
  initialReps,
  initialRir,
  initialSpeedMph,
  initialGradePct,
  bodyweightLb,
  onSave,
  done,
}: {
  prescription: Prescription;
  lift: Lift;
  isCardio: boolean;
  repUnitLabel: string;
  initialWeight: number;
  initialReps: number;
  initialRir?: number;
  initialSpeedMph: number;
  initialGradePct: number;
  /** Session bodyweight anchor for `p1_assisted` moved-load estimate. */
  bodyweightLb?: number;
  onSave: (
    weight: number,
    reps: number,
    rir: number | undefined,
    status: SetStatus,
    cardioMeta?: CardioSetMeta,
  ) => void | Promise<void>;
  done: boolean;
}) {
  const [w, setW] = useState(initialWeight);
  const [r, setR] = useState(initialReps);
  const [rir, setRir] = useState<number>(initialRir ?? 2);
  const ct = liftToCardioType(lift.id);
  const [speedMph, setSpeedMph] = useState(initialSpeedMph);
  const [gradePct, setGradePct] = useState(initialGradePct);
  const speedGradeKey = `${initialSpeedMph}|${initialGradePct}`;
  const [speedGradeSeen, setSpeedGradeSeen] = useState(speedGradeKey);
  if (speedGradeKey !== speedGradeSeen) {
    setSpeedGradeSeen(speedGradeKey);
    setSpeedMph(initialSpeedMph);
    setGradePct(initialGradePct);
  }
  const [avgHr, setAvgHr] = useState<number | ''>('');
  const [peakHr, setPeakHr] = useState<number | ''>('');
  const [cardioWallClockStart, setCardioWallClockStart] = useState<string | null>(null);

  if (done && cardioWallClockStart != null) {
    setCardioWallClockStart(null);
  }

  const allowNegative = lift.id === 'p1_assisted'; // assistance load
  const showWeight = lift.loadUnit !== 'none';
  const trackRpe = shouldTrackRpeForReps(r);
  const derivedRpe = trackRpe ? rpeFromRir(rir) : null;

  function cardioMeta(): CardioSetMeta | undefined {
    if (!isCardio) return undefined;
    const timer = cardioWallClockStart ?? undefined;
    if (ct === 'liss') return { speedMph, gradePct, timerStartedAt: timer };
    return {
      avgHr: avgHr === '' ? undefined : Number(avgHr),
      peakHr: peakHr === '' ? undefined : Number(peakHr),
      timerStartedAt: timer,
    };
  }

  const minuteCardio = isCardio && lift.repUnit === 'minutes';

  return (
    <div className="space-y-2">
      {minuteCardio && (
        <CardioDurationTimer
          startedAtIso={cardioWallClockStart}
          onStartedAtChange={setCardioWallClockStart}
          onApplyMinutes={(min) => setR(min)}
        />
      )}
      {isCardio && ct === 'liss' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs text-zinc-500 flex flex-col gap-1">
            Speed (mph)
            <DecimalStepper
              value={speedMph}
              onChange={setSpeedMph}
              step={0.1}
              min={0.1}
              max={15}
              unit="mph"
            />
          </label>
          <label className="text-xs text-zinc-500 flex flex-col gap-1">
            Incline (%)
            <DecimalStepper
              value={gradePct}
              onChange={setGradePct}
              step={0.5}
              min={0}
              max={30}
              unit="%"
            />
          </label>
        </div>
      )}
      {isCardio && ct === 'intervals' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-zinc-500">
            Avg HR (optional)
            <input
              type="number"
              inputMode="numeric"
              value={avgHr === '' ? '' : avgHr}
              onChange={(e) => {
                const v = e.target.value;
                setAvgHr(v === '' ? '' : parseInt(v, 10));
              }}
              className="mt-1 block w-full h-10 rounded-lg bg-zinc-950 border border-zinc-800 px-2 font-mono text-sm"
            />
          </label>
          <label className="text-xs text-zinc-500">
            Peak HR (optional)
            <input
              type="number"
              inputMode="numeric"
              value={peakHr === '' ? '' : peakHr}
              onChange={(e) => {
                const v = e.target.value;
                setPeakHr(v === '' ? '' : parseInt(v, 10));
              }}
              className="mt-1 block w-full h-10 rounded-lg bg-zinc-950 border border-zinc-800 px-2 font-mono text-sm"
            />
          </label>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {showWeight && (
          <WeightStepper
            lift={lift}
            value={w}
            onChange={setW}
            stepIncrement={prescription.increment}
            allowNegative={allowNegative}
            unit={lift.loadUnit === 'lb' ? 'lb' : ''}
          />
        )}
        <RepStepper value={r} onChange={setR} unit={repUnitLabel} />
        {trackRpe && !(isCardio && ct === 'liss') ? (
          <label className="text-xs text-zinc-500">
            RIR
            <div className="mt-1">
              <RirStepper value={rir} onChange={setRir} />
            </div>
            <div className="mt-1 text-[10px] text-zinc-500">RPE {derivedRpe?.toFixed(1)}</div>
          </label>
        ) : !isCardio ? (
          <div className="text-[11px] text-zinc-500">RPE hidden for sets over 12 reps</div>
        ) : null}
      </div>
      {lift.id === 'bss' && !isCardio && (
        <p className="text-[10px] text-zinc-500">Reps = per leg (×2 total)</p>
      )}
      {lift.id === 'p1_assisted' && showWeight && (
        <p className="text-[10px] text-zinc-500 leading-snug">
          Counterweight assistance: <span className="text-zinc-400">lower lb = lighter band and closer to full bodyweight</span>
          (then unassisted / weighted).{' '}
          {bodyweightLb != null && bodyweightLb > 0 ? (
            <>
              Est. weight moved (concentric):{' '}
              <span className="font-mono text-zinc-300">
                ~{Math.round(Math.max(0, bodyweightLb - w) * r)} lb
              </span>
              {' '}
              <span className="text-zinc-600">
                ({bodyweightLb} lb BW − {w} lb assist × {r})
              </span>
            </>
          ) : (
            <> Log bodyweight in check-in or the BW tab to estimate moved load from assistance.</>
          )}
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => onSave(w, r, trackRpe ? rir : undefined, 'completed', cardioMeta())}
          className={`flex-1 h-11 rounded-xl font-medium ${done ? 'bg-emerald-700' : 'bg-emerald-600 active:bg-emerald-700'}`}
        >
          {done ? 'Update set' : (isCardio ? 'Log cardio' : 'Log set')}
        </button>
      </div>
      {prescription.liftId === 'pp' && (
        <div className="text-[11px] text-rose-300 font-semibold">
          BRACE YOUR GODDAMN CORE, or you&apos;ll hurt your back again
        </div>
      )}
    </div>
  );
}
