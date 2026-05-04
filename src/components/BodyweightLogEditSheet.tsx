'use client';

import { useEffect, useState } from 'react';
import { flushDirty, localUpsert } from '@/lib/sync';
import { fmtDate, isoWeekStringFromIsoDate } from '@/lib/time';
import type { BodyweightLog } from '@/lib/types';

export function BodyweightLogEditSheet({
  log,
  onClose,
}: {
  log: BodyweightLog;
  onClose: () => void;
}) {
  const [lb, setLb] = useState(log.bodyweight);
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
      await localUpsert('bodyweight_logs', {
        id: log.id,
        date: log.date,
        isoWeek: isoWeekStringFromIsoDate(log.date),
        bodyweight: lb,
      });
      await flushDirty().catch(() => {});
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
        aria-labelledby="bw-edit-title"
        className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl max-h-[min(92dvh,720px)] flex flex-col"
      >
        <div className="p-4 border-b border-zinc-800 shrink-0">
          <h2 id="bw-edit-title" className="text-lg font-semibold text-zinc-100">
            Edit bodyweight
          </h2>
          <p className="text-sm text-zinc-500 mt-1">{fmtDate(log.date, 'EEE, MMM d, yyyy')}</p>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          <p className="text-xs text-zinc-500">Same storage as Today and Daily Check-In — one entry per calendar day.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={lb}
              onChange={(e) => setLb(parseFloat(e.target.value || '0'))}
              className="h-11 w-28 rounded-lg bg-zinc-950 border border-zinc-800 px-3 text-center font-mono"
              aria-label="Bodyweight in lb"
            />
            <span className="text-zinc-500 text-sm">lb</span>
          </div>
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
