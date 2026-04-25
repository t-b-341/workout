'use client';

import { useState } from 'react';
import { useLastSessionsForLift, useLifts, useSetsForSession } from '@/lib/hooks';
import { localDelete, localUpsert } from '@/lib/sync';
import type { CardioLog, CardioType, Lift, Prescription, SessionLog, SetLog, SetStatus } from '@/lib/types';
import { WeightStepper, RepStepper } from './WeightStepper';
import { fmtDate } from '@/lib/time';
import { platesPerSide } from '@/lib/plates';

type Props = {
  prescription: Prescription;
  lift: Lift;
  session: SessionLog;
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

  function getSet(setIndex: number, side?: 'L' | 'R'): SetLog | undefined {
    return liftSets.find((s) => s.setIndex === setIndex && s.side === side);
  }

  async function logSet(args: {
    setIndex: number;
    side?: 'L' | 'R';
    weight: number;
    reps: number;
    status?: SetStatus;
    substituteLiftId?: string;
    reason?: string;
  }) {
    const existing = getSet(args.setIndex, args.side);
    const id = existing?.id ?? `${session.id}-${prescription.id}-${args.setIndex}-${args.side ?? 'X'}`;
    const status = args.status ?? 'completed';
    const row: SetLog = {
      id,
      sessionLogId: session.id,
      liftId: prescription.liftId,
      prescriptionId: prescription.id,
      setIndex: args.setIndex,
      weight: args.weight,
      reps: args.reps,
      status,
      substituteLiftId: args.substituteLiftId,
      reason: args.reason,
      side: args.side,
    };
    await localUpsert('set_logs', row);

    // Cardio lifts mirror to cardio_logs so the weekly 150-min rollup sees them.
    if (isCardio) {
      const cardioId = `cardio-${session.id}-${prescription.id}-${args.setIndex}`;
      if (status === 'completed') {
        const cardioRow: CardioLog = {
          id: cardioId,
          sessionLogId: session.id,
          date: session.date,
          type: liftToCardioType(lift.id),
          durationMin: args.reps,
          notes: prescription.notes,
        };
        await localUpsert('cardio_logs', cardioRow);
      } else {
        await localDelete('cardio_logs', cardioId);
      }
    }
  }

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
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
          {lift.equipment === 'barbell' && prescription.weight > 0 && (() => {
            const plates = platesPerSide(prescription.weight);
            return plates ? (
              <div className="text-xs text-zinc-500 mt-1">Plates/side: <span className="font-mono">{plates}</span></div>
            ) : null;
          })()}
        </div>
      </div>

      {lastSession && (
        <div className="text-xs text-zinc-500 border-t border-zinc-800 pt-2">
          <span className="text-zinc-400">Last ({fmtDate(lastSession.session.date)}):</span>{' '}
          <span className="font-mono">
            {lastSession.sets.map((s) => `${s.weight}×${s.reps}`).join(', ')}
          </span>
        </div>
      )}

      <div className="space-y-2">
        {indexes.map((idx) =>
          sides.map((side) => {
            const existing = getSet(idx, side);
            const isDone = !!existing && existing.status !== 'skipped';
            return (
              <div
                key={`${idx}-${side ?? 'X'}`}
                className={`rounded-xl border ${existing ? 'border-zinc-700 bg-zinc-950' : 'border-zinc-800 bg-zinc-900'} p-3`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-zinc-300 font-medium">
                    Set {idx + 1}{side ? ` · ${side}` : ''}
                  </div>
                  {existing && (
                    <span className={`text-xs px-2 py-0.5 rounded-full text-white ${STATUS_COLOR[existing.status]}`}>
                      {STATUS_LABEL[existing.status]}
                    </span>
                  )}
                </div>

                <SetRow
                  prescription={prescription}
                  lift={lift}
                  isCardio={isCardio}
                  repUnitLabel={repUnitLabel}
                  initialWeight={existing?.weight ?? prescription.weight}
                  initialReps={existing?.reps ?? prescription.repMin}
                  onSave={(weight, reps, status) =>
                    logSet({ setIndex: idx, side, weight, reps, status })
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

function SetRow({
  prescription,
  lift,
  isCardio,
  repUnitLabel,
  initialWeight,
  initialReps,
  onSave,
  done,
}: {
  prescription: Prescription;
  lift: Lift;
  isCardio: boolean;
  repUnitLabel: string;
  initialWeight: number;
  initialReps: number;
  onSave: (weight: number, reps: number, status: SetStatus) => void | Promise<void>;
  done: boolean;
}) {
  const [w, setW] = useState(initialWeight);
  const [r, setR] = useState(initialReps);

  const allowNegative = lift.id === 'p1_assisted'; // assistance load
  const showWeight = lift.loadUnit !== 'none';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {showWeight && (
          <WeightStepper
            value={w}
            onChange={setW}
            equipment={lift.equipment}
            increment={prescription.increment ?? lift.increment}
            allowNegative={allowNegative}
            unit={lift.loadUnit === 'lb' ? 'lb' : ''}
          />
        )}
        <RepStepper value={r} onChange={setR} unit={repUnitLabel} />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onSave(w, r, 'completed')}
          className={`flex-1 h-11 rounded-xl font-medium ${done ? 'bg-emerald-700' : 'bg-emerald-600 active:bg-emerald-700'}`}
        >
          {done ? 'Update set' : (isCardio ? 'Log cardio' : 'Log set')}
        </button>
      </div>
    </div>
  );
}
