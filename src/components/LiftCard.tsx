'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useAllSessions,
  useAllSets,
  useLastSessionsForLift,
  useLifts,
  useSetsForSession,
} from '@/lib/hooks';
import { localDelete, localUpsert } from '@/lib/sync';
import type { CardioLog, CardioType, Lift, Prescription, SessionLog, SetLog, SetStatus } from '@/lib/types';
import { LooseDecimalField, RepStepper, RirStepper, WeightStepper } from './WeightStepper';
import { fmtDate } from '@/lib/time';
import { platesPerSide } from '@/lib/plates';
import { snapWorkingWeight } from '@/lib/progression';
import { detectPR, est1RM } from '@/lib/stats';
import { RestTimer } from './RestTimer';
import { rpeFromRir, shouldTrackRpeForReps } from '@/lib/rpe';
import { resolveCardioTimestamps } from '@/lib/cardioTime';

type Props = {
  prescription: Prescription;
  lift: Lift;
  session: SessionLog;
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

export function LiftCard({ prescription, lift, session }: Props) {
  const sets = useSetsForSession(session.id);
  const history = useLastSessionsForLift(prescription.liftId, 3);
  const lifts = useLifts();
  const allSets = useAllSets();
  const allSessions = useAllSessions();
  const [openSubs, setOpenSubs] = useState<number | null>(null);
  const [reasonDraft, setReasonDraft] = useState('');
  const [substituteId, setSubstituteId] = useState<string>('');

  const liftSets = (sets ?? []).filter((s) => s.prescriptionId === prescription.id);
  const indexes = Array.from({ length: prescription.sets }, (_, i) => i);
  const sides: Array<'L' | 'R' | undefined> = prescription.perSide ? ['L', 'R'] : [undefined];

  const lastSession = history?.[0];

  const repUnitLabel = lift.repUnit === 'seconds' ? 'sec'
    : lift.repUnit === 'minutes' ? 'min'
    : lift.repUnit === 'lengths' ? 'len'
    : 'reps';

  const isCardio = lift.equipment === 'cardio';

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
    return detectPR(set, set.liftId, prior, allSessions);
  }

  function getSet(setIndex: number, side?: 'L' | 'R'): SetLog | undefined {
    // Treat null and undefined as the same "no side" — older synced rows may
    // have side: null from Postgres while local writes use undefined.
    return liftSets.find(
      (s) => s.setIndex === setIndex && (s.side ?? undefined) === side,
    );
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
    const row: SetLog = {
      id,
      sessionLogId: session.id,
      liftId: prescription.liftId,
      prescriptionId: prescription.id,
      setIndex: args.setIndex,
      weight,
      reps: args.reps,
      rir: shouldTrackRpeForReps(args.reps) && args.rir != null ? args.rir : undefined,
      rpe: shouldTrackRpeForReps(args.reps) && args.rir != null ? rpeFromRir(args.rir) : undefined,
      status,
      substituteLiftId: args.substituteLiftId,
      reason: args.reason,
      side: args.side,
      loggedAt: new Date().toISOString(),
    };
    await localUpsert('set_logs', row);

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
        await localDelete('cardio_logs', cardioId);
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

      <div className="space-y-2">
        {indexes.map((idx) =>
          sides.map((side) => {
            const existing = getSet(idx, side);
            const isDone = !!existing && existing.status !== 'skipped';
            const key = `${idx}-${side ?? 'X'}`;
            const isNextUnlogged = key === nextUnloggedKey;
            const pr = prFor(existing);
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
                      {pr?.e1rmPR && !pr?.repPR && existing && (
                        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-700 text-amber-100 font-semibold">
                          e1RM PR · {Math.round(est1RM(existing.weight, existing.reps))}
                        </span>
                      )}
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
                    onSave={(weight, reps, rir, status, cardioMeta) =>
                      logSet({ setIndex: idx, side, weight, reps, rir, status, cardioMeta })
                    }
                    done={isDone}
                  />

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
    </div>
  );
}

function liftToCardioType(liftId: string): CardioType {
  return liftId.includes('interval') ? 'intervals' : 'liss';
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
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!startedAtIso) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [startedAtIso]);

  const elapsedSec = startedAtIso
    ? Math.max(0, Math.floor((Date.now() - Date.parse(startedAtIso)) / 1000))
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
  const [speedMph, setSpeedMph] = useState(2);
  const [gradePct, setGradePct] = useState(3);
  const [avgHr, setAvgHr] = useState<number | ''>('');
  const [peakHr, setPeakHr] = useState<number | ''>('');
  const [cardioWallClockStart, setCardioWallClockStart] = useState<string | null>(null);

  useEffect(() => {
    if (done) setCardioWallClockStart(null);
  }, [done]);

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
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-zinc-500">
            Speed (mph)
            <LooseDecimalField
              value={speedMph}
              onCommit={setSpeedMph}
              className="mt-1 block w-full h-10 rounded-lg bg-zinc-950 border border-zinc-800 px-2 font-mono text-sm"
            />
          </label>
          <label className="text-xs text-zinc-500">
            Incline (%)
            <LooseDecimalField
              value={gradePct}
              onCommit={setGradePct}
              className="mt-1 block w-full h-10 rounded-lg bg-zinc-950 border border-zinc-800 px-2 font-mono text-sm"
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
        {trackRpe ? (
          <label className="text-xs text-zinc-500">
            RIR
            <div className="mt-1">
              <RirStepper value={rir} onChange={setRir} />
            </div>
            <div className="mt-1 text-[10px] text-zinc-500">RPE {derivedRpe?.toFixed(1)}</div>
          </label>
        ) : (
          <div className="text-[11px] text-zinc-500">RPE hidden for sets over 12 reps</div>
        )}
      </div>
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
