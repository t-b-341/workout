'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLifts, usePrescriptions } from '@/lib/hooks';
import { getDb } from '@/lib/db';
import { flushDirty, localDelete, localUpsert } from '@/lib/sync';
import { fmtDate } from '@/lib/time';
import { snapWorkingWeight } from '@/lib/progression';
import { rpeFromRir, shouldTrackRpeForReps } from '@/lib/rpe';
import { resolveCardioTimestamps } from '@/lib/cardioTime';
import type {
  CardioLog,
  CardioType,
  Lift,
  Prescription,
  SessionLabelType,
  SessionLog,
  SetIntent,
  SetLog,
  SetStatus,
} from '@/lib/types';
import { SESSION_LABEL_TYPES } from '@/lib/types';
import { LooseDecimalField, LooseIntField, RirStepper, DecimalStepper } from './WeightStepper';

const SESSION_FOCUS_UI: Record<SessionLabelType, string> = {
  accumulation: 'Accumulation block',
  deload: 'Deload week',
  pr_test: 'PR / strength test',
  abbreviated: 'Short session',
  standard: 'Standard',
};

const STATUSES: SetStatus[] = ['completed', 'reduced', 'skipped', 'substituted'];

function liftToCardioType(liftId: string): CardioType {
  return liftId.includes('interval') ? 'intervals' : 'liss';
}

async function mirrorCardioFromSet(
  session: SessionLog,
  row: SetLog,
  lift: Lift,
  prescription: Prescription | undefined,
) {
  if (lift.equipment !== 'cardio') return;
  const cardioId = `cardio-${session.id}-${row.prescriptionId}-${row.setIndex}`;
  if (row.status === 'completed') {
    const db = getDb();
    const prev = await db.cardio_logs.get(cardioId);
    const loggedAt = row.loggedAt ?? new Date().toISOString();
    const { startedAt, endedAt } = resolveCardioTimestamps(loggedAt, row.reps, undefined);
    const cardioRow: CardioLog = {
      id: cardioId,
      sessionLogId: session.id,
      date: session.date,
      type: liftToCardioType(lift.id),
      durationMin: row.reps,
      startedAt,
      endedAt,
      notes: prescription?.notes ?? prev?.notes,
      ...(liftToCardioType(lift.id) === 'liss'
        ? {
            speedMph: row.speedMph ?? prev?.speedMph,
            gradePct: row.gradePct ?? prev?.gradePct,
          }
        : {
            avgHr: prev?.avgHr,
            peakHr: prev?.peakHr,
          }),
    };
    await localUpsert('cardio_logs', cardioRow);
  } else {
    await localDelete('cardio_logs', cardioId, { undoLabel: 'Timer cardio' });
  }
}

type Props = {
  session: SessionLog;
  initialSets: SetLog[];
  onClose: () => void;
};

export function SessionEditSheet({ session, initialSets, onClose }: Props) {
  const prescriptions = usePrescriptions(session.templateId);
  const lifts = useLifts();
  const [notes, setNotes] = useState(session.notes ?? '');
  const sessionFocusKey = `${session.id}|${session.sessionType ?? 'standard'}`;
  const [sessionFocusKeySeen, setSessionFocusKeySeen] = useState(sessionFocusKey);
  const [sessionFocus, setSessionFocus] = useState<SessionLabelType>(session.sessionType ?? 'standard');
  if (sessionFocusKey !== sessionFocusKeySeen) {
    setSessionFocusKeySeen(sessionFocusKey);
    setSessionFocus(session.sessionType ?? 'standard');
  }
  const [rows, setRows] = useState<SetLog[]>(initialSets);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const liftMap = useMemo(() => new Map((lifts ?? []).map((l) => [l.id, l])), [lifts]);
  const rxList = useMemo(() => prescriptions ?? [], [prescriptions]);
  const rxMap = useMemo(() => new Map(rxList.map((p) => [p.id, p])), [rxList]);

  const [busy, setBusy] = useState(false);

  async function handleSave() {
    if (!lifts?.length) return;
    const db = getDb();
    let rxResolved: Prescription[] = rxList;
    if (rxResolved.length === 0) {
      rxResolved = await db.prescriptions.where('templateId').equals(session.templateId).toArray();
      rxResolved.sort((a, b) => a.order - b.order);
    }
    const rxLookup = new Map(rxResolved.map((p) => [p.id, p]));

    setBusy(true);
    try {
      const trimmed = notes.trim();
      await localUpsert('session_logs', {
        ...session,
        notes: trimmed || undefined,
        sessionType: sessionFocus,
      });

      for (const row of rows) {
        const lift = liftMap.get(row.liftId);
        if (!lift) continue;
        const w = Number.isFinite(row.weight) ? row.weight : 0;
        const r = Number.isFinite(row.reps) ? Math.round(row.reps) : 0;
        const status = row.status;
        const snapRef = { id: lift.id, equipment: lift.equipment, loadUnit: lift.loadUnit };
        const next: SetLog = {
          ...row,
          intent: row.intent ?? 'working',
          weight: snapWorkingWeight(w, snapRef),
          reps: r,
          rir: shouldTrackRpeForReps(r) && row.rir != null ? row.rir : undefined,
          rpe: shouldTrackRpeForReps(r) && row.rir != null ? rpeFromRir(row.rir) : undefined,
          status,
          reason: row.reason?.trim() || undefined,
          substituteLiftId: status === 'substituted' ? row.substituteLiftId : undefined,
        };
        await localUpsert('set_logs', next);
        await mirrorCardioFromSet(session, next, lift, rxLookup.get(row.prescriptionId));
      }
      await flushDirty();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  function patchRow(id: string, patch: Partial<SetLog>) {
    setRows((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  if (!lifts?.length) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
        <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70" onClick={onClose} />
        <div className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-zinc-800 bg-zinc-950 p-8 text-zinc-500 text-center">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-edit-title"
        className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl max-h-[min(92dvh,720px)] flex flex-col"
      >
        <div className="p-4 border-b border-zinc-800 shrink-0">
          <h2 id="session-edit-title" className="text-lg font-semibold text-zinc-100">
            Edit session
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            {fmtDate(session.date, 'EEE, MMM d')} · {session.templateId}
          </p>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          <div>
            <label htmlFor="session-notes" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Session notes
            </label>
            <textarea
              id="session-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="How it felt, injuries, context for next time…"
              className="mt-2 w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 resize-y min-h-[5rem]"
            />
          </div>

          <div>
            <label htmlFor="session-focus" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Session focus
            </label>
            <select
              id="session-focus"
              value={sessionFocus}
              onChange={(e) => setSessionFocus(e.target.value as SessionLabelType)}
              className="mt-2 block w-full max-w-xs h-10 rounded-xl bg-zinc-900 border border-zinc-800 px-3 text-sm text-zinc-200"
            >
              {SESSION_LABEL_TYPES.map((t) => (
                <option key={t} value={t}>{SESSION_FOCUS_UI[t]}</option>
              ))}
            </select>
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-zinc-500">No sets logged for this session.</p>
          ) : (
            <div className="space-y-3">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Sets</div>
              {rows.map((row) => {
                const lift = liftMap.get(row.liftId);
                const rx = rxMap.get(row.prescriptionId);
                const sideLabel = row.side ? ` · ${row.side}` : '';
                return (
                  <div
                    key={row.id}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3 space-y-2"
                  >
                    <div className="text-sm font-medium text-zinc-200">
                      {lift?.name ?? row.liftId}
                      <span className="text-zinc-500 font-normal">
                        {' '}
                        · set {row.setIndex + 1}
                        {sideLabel}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 items-end">
                      {lift?.loadUnit !== 'none' && (
                        <label className="text-xs text-zinc-500 shrink-0">
                          Weight (lb)
                          <LooseDecimalField
                            value={row.weight}
                            onCommit={(n) => patchRow(row.id, { weight: n })}
                            className="mt-1 block w-24 h-9 rounded-lg bg-zinc-950 border border-zinc-700 px-2 text-sm font-mono text-zinc-200"
                          />
                        </label>
                      )}
                      <label className="text-xs text-zinc-500 shrink-0">
                        {lift?.repUnit === 'reps' || !lift ? 'Reps' : lift.repUnit}
                        <LooseIntField
                          value={row.reps}
                          min={0}
                          max={999}
                          onCommit={(n) => patchRow(row.id, { reps: n })}
                          className="mt-1 block w-20 h-9 rounded-lg bg-zinc-950 border border-zinc-700 px-2 text-sm font-mono text-zinc-200"
                        />
                      </label>
                      <label className="text-xs text-zinc-500 shrink-0 min-w-[120px]">
                        Status
                        <select
                          value={row.status}
                          onChange={(e) =>
                            patchRow(row.id, { status: e.target.value as SetStatus })
                          }
                          className="mt-1 block w-full h-9 rounded-lg bg-zinc-950 border border-zinc-700 px-2 text-sm text-zinc-200"
                        >
                          {STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-zinc-500 shrink-0 min-w-[120px]">
                        Intent
                        <select
                          value={row.intent ?? 'working'}
                          onChange={(e) =>
                            patchRow(row.id, { intent: e.target.value as SetIntent })
                          }
                          className="mt-1 block w-full h-9 rounded-lg bg-zinc-950 border border-zinc-700 px-2 text-sm text-zinc-200"
                        >
                          <option value="warmup">Warmup</option>
                          <option value="working">Working</option>
                          <option value="backoff">Backoff</option>
                          <option value="max_test">PR / max test</option>
                          <option value="skipped">Skipped</option>
                        </select>
                      </label>
                      {shouldTrackRpeForReps(row.reps) ? (
                        <label className="text-xs text-zinc-500 shrink-0">
                          RIR
                          <div className="mt-1">
                            <RirStepper
                              compact
                              value={row.rir ?? 2}
                              onChange={(n) => patchRow(row.id, { rir: n })}
                            />
                          </div>
                          <div className="mt-1 text-[10px] text-zinc-500">
                            RPE {rpeFromRir(row.rir ?? 2).toFixed(1)}
                          </div>
                        </label>
                      ) : (
                        <div className="text-[11px] text-zinc-500">RPE hidden for sets over 12 reps</div>
                      )}
                    </div>
                    {lift?.id === 'liss' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-zinc-800 pt-3">
                        <label className="text-xs text-zinc-500 flex flex-col gap-1">
                          Speed (mph)
                          <DecimalStepper
                            value={row.speedMph ?? 2}
                            onChange={(n) => patchRow(row.id, { speedMph: n })}
                            step={0.1}
                            min={0.1}
                            max={15}
                            unit="mph"
                          />
                        </label>
                        <label className="text-xs text-zinc-500 flex flex-col gap-1">
                          Incline (%)
                          <DecimalStepper
                            value={row.gradePct ?? 0}
                            onChange={(n) => patchRow(row.id, { gradePct: n })}
                            step={0.5}
                            min={0}
                            max={30}
                            unit="%"
                          />
                        </label>
                      </div>
                    )}
                    {row.status === 'substituted' && (
                      <label className="block text-xs text-zinc-500">
                        Substitute lift
                        <select
                          value={row.substituteLiftId ?? ''}
                          onChange={(e) =>
                            patchRow(row.id, { substituteLiftId: e.target.value || undefined })
                          }
                          className="mt-1 block w-full h-9 rounded-lg bg-zinc-950 border border-zinc-700 px-2 text-sm text-zinc-200"
                        >
                          <option value="">Select…</option>
                          {lifts
                            .filter((l) => l.id !== row.liftId)
                            .map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                    <label className="block text-xs text-zinc-500">
                      Reason (optional)
                      <input
                        value={row.reason ?? ''}
                        onChange={(e) => patchRow(row.id, { reason: e.target.value })}
                        placeholder="e.g. shoulder tweak"
                        className="mt-1 w-full h-9 rounded-lg bg-zinc-950 border border-zinc-700 px-2 text-sm text-zinc-200"
                      />
                    </label>
                    {rx?.notes && (
                      <div className="text-[11px] text-zinc-600">Rx: {rx.notes}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-zinc-800 shrink-0 flex gap-2 supports-[padding:max(0px)]:pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-2xl border border-zinc-700 text-zinc-300 font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy}
            className="flex-1 h-12 rounded-2xl bg-amber-500 text-zinc-950 font-semibold disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
