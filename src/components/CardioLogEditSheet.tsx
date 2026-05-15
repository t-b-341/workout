'use client';

import { useEffect, useState } from 'react';
import { localUpsert } from '@/lib/sync';
import { fmtDate } from '@/lib/time';
import type { CardioLog } from '@/lib/types';
import { DecimalStepper, LooseIntField } from './WeightStepper';

type Props = {
  log: CardioLog;
  onClose: () => void;
};

export function CardioLogEditSheet({ log, onClose }: Props) {
  const [duration, setDuration] = useState(log.durationMin);
  const [speed, setSpeed] = useState(log.speedMph ?? 2.0);
  const [grade, setGrade] = useState(log.gradePct ?? 3.0);
  const [avgHr, setAvgHr] = useState<number | ''>(log.avgHr ?? '');
  const [peakHr, setPeakHr] = useState<number | ''>(log.peakHr ?? '');
  const [notes, setNotes] = useState(log.notes ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save() {
    setBusy(true);
    try {
      const trimmedNotes = notes.trim();
      const row: CardioLog = {
        ...log,
        durationMin: duration,
        notes: trimmedNotes || undefined,
        ...(log.type === 'liss'
          ? {
              speedMph: speed,
              gradePct: grade,
            }
          : {
              avgHr: avgHr === '' ? undefined : avgHr,
              peakHr: peakHr === '' ? undefined : peakHr,
            }),
      };
      await localUpsert('cardio_logs', row);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cardio-edit-title"
        className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl max-h-[min(92dvh,720px)] flex flex-col"
      >
        <div className="p-4 border-b border-zinc-800 shrink-0 flex items-start justify-between gap-3">
          <div>
            <h2 id="cardio-edit-title" className="text-lg font-semibold text-zinc-100">
              Edit cardio log
            </h2>
            <p className="text-sm text-zinc-500 mt-1">{fmtDate(log.date, 'EEE, MMM d, yyyy')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 h-9 w-9 rounded-lg bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          <div>
            <div className="text-xs text-zinc-500 uppercase tracking-wider">Type</div>
            <div className="mt-1 text-sm font-medium text-zinc-200">
              {log.type === 'liss' ? 'LISS' : 'Intervals'}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Duration (min)</span>
            <LooseIntField
              value={duration}
              min={1}
              max={999}
              onCommit={setDuration}
              className="h-11 px-3 rounded-xl bg-zinc-950 border border-zinc-800"
            />
          </label>

          {log.type === 'liss' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-zinc-500">
                Speed (mph)
                <DecimalStepper
                  value={speed}
                  onChange={setSpeed}
                  step={0.1}
                  min={0.1}
                  max={15}
                  unit="mph"
                  inputClassName="flex-1 min-w-0 h-11 rounded-xl bg-zinc-950 border border-zinc-800 px-3 font-mono text-sm text-center"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-500">
                Grade (%)
                <DecimalStepper
                  value={grade}
                  onChange={setGrade}
                  step={0.5}
                  min={0}
                  max={30}
                  unit="%"
                  inputClassName="flex-1 min-w-0 h-11 rounded-xl bg-zinc-950 border border-zinc-800 px-3 font-mono text-sm text-center"
                />
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">Avg HR (optional)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={avgHr === '' ? '' : avgHr}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAvgHr(v === '' ? '' : parseInt(v, 10));
                  }}
                  className="h-11 px-3 rounded-xl bg-zinc-950 border border-zinc-800"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">Peak HR (optional)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={peakHr === '' ? '' : peakHr}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPeakHr(v === '' ? '' : parseInt(v, 10));
                  }}
                  className="h-11 px-3 rounded-xl bg-zinc-950 border border-zinc-800"
                />
              </label>
            </div>
          )}

          <label className="block text-xs text-zinc-500">
            Notes (optional)
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes"
              className="mt-1 block w-full h-11 px-3 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-200"
            />
          </label>
        </div>

        <div className="p-4 border-t border-zinc-800 shrink-0 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-4 rounded-lg bg-zinc-800 text-sm text-zinc-300"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="h-11 px-4 rounded-lg bg-amber-500 text-zinc-950 font-medium text-sm disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
