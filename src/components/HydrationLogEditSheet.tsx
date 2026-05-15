'use client';

import { useEffect, useState } from 'react';
import { flushDirty, localUpsert } from '@/lib/sync';
import { fmtDate } from '@/lib/time';
import type { HydrationLog } from '@/lib/types';

const ML_PER_OZ = 29.5737;

function ozToMl(oz: number): number {
  return Math.round(oz * ML_PER_OZ);
}

function mlToOz(ml: number): number {
  return Math.round((ml / ML_PER_OZ) * 10) / 10;
}

const URINE_COLORS: Array<{ value: NonNullable<HydrationLog['urineColor']>; label: string }> = [
  { value: 1, label: '1 · very clear' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5' },
  { value: 6, label: '6' },
  { value: 7, label: '7' },
  { value: 8, label: '8 · very dark' },
];

export function HydrationLogEditSheet({
  log,
  onClose,
}: {
  log: HydrationLog;
  onClose: () => void;
}) {
  const [targetOz, setTargetOz] = useState(() => mlToOz(log.waterTargetMl));
  const [actualOz, setActualOz] = useState(() => mlToOz(log.waterActualMl));
  const [electrolytes, setElectrolytes] = useState(log.electrolytes);
  const [urineColor, setUrineColor] = useState<HydrationLog['urineColor'] | ''>(log.urineColor ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pctDisplay = targetOz <= 0 ? 0 : Math.round((actualOz / targetOz) * 100);

  async function save() {
    setBusy(true);
    try {
      await localUpsert('hydration_logs', {
        ...log,
        waterTargetMl: ozToMl(targetOz),
        waterActualMl: ozToMl(actualOz),
        electrolytes,
        urineColor: urineColor === '' ? undefined : urineColor,
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
        aria-labelledby="hydration-edit-title"
        className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl max-h-[min(92dvh,720px)] flex flex-col"
      >
        <div className="p-4 border-b border-zinc-800 shrink-0">
          <h2 id="hydration-edit-title" className="text-lg font-semibold text-zinc-100">
            Edit hydration log
          </h2>
          <p className="text-sm text-zinc-500 mt-1">{fmtDate(log.date, 'EEE, MMM d, yyyy')}</p>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          <p className="text-xs text-zinc-500">
            Stored in milliliters; edited in US fluid ounces (same as Daily Check-In).
          </p>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-sm font-medium text-zinc-200">Daily target</span>
              <span className="text-xs text-zinc-500">fl oz</span>
            </div>
            <input
              type="number"
              min={0}
              step={4}
              value={targetOz || ''}
              onChange={(e) => setTargetOz(Math.max(0, parseFloat(e.target.value || '0')))}
              className="h-10 w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 font-mono text-sm"
              aria-label="Water target in fluid ounces"
            />
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-sm font-medium text-zinc-200">Today&apos;s intake</span>
              <span className="text-xs font-mono text-zinc-500">{pctDisplay}% of target</span>
            </div>
            <input
              type="number"
              min={0}
              step={4}
              value={actualOz || ''}
              onChange={(e) => setActualOz(Math.max(0, parseFloat(e.target.value || '0')))}
              className="h-10 w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 font-mono text-sm"
              aria-label="Water actual in fluid ounces"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={electrolytes}
              onChange={(e) => setElectrolytes(e.target.checked)}
            />
            Electrolytes (training / sweat day)
          </label>

          <div>
            <label htmlFor="hydration-urine-color" className="text-xs text-zinc-500">
              Urine color (optional)
            </label>
            <select
              id="hydration-urine-color"
              value={urineColor === '' ? '' : String(urineColor)}
              onChange={(e) => {
                const v = e.target.value;
                setUrineColor(v === '' ? '' : (Number(v) as HydrationLog['urineColor']));
              }}
              className="mt-1 block w-full h-10 rounded-lg bg-zinc-950 border border-zinc-800 px-3 text-sm text-zinc-200"
            >
              <option value="">Not set</option>
              {URINE_COLORS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-zinc-600 mt-1">1 = very clear, 8 = very dark</p>
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
