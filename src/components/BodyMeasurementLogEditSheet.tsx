'use client';

import { useEffect, useState } from 'react';
import { flushDirty, localUpsert } from '@/lib/sync';
import { fmtDate } from '@/lib/time';
import { MEASUREMENT_TIME_OF_DAY } from '@/lib/types';
import type { BodyMeasurementLog, MeasurementTimeOfDay } from '@/lib/types';

function MeasureInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="text-xs text-zinc-500">
      {label}
      <input
        type="number"
        inputMode="decimal"
        step="0.1"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value || '0'))}
        className="mt-1 h-10 w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 text-center font-mono text-sm"
      />
    </label>
  );
}

export function BodyMeasurementLogEditSheet({
  log,
  onClose,
}: {
  log: BodyMeasurementLog;
  onClose: () => void;
}) {
  const [waist, setWaist] = useState(log.waist);
  const [abdomen, setAbdomen] = useState(log.abdomen);
  const [hips, setHips] = useState(log.hips);
  const [protocol, setProtocol] = useState(log.protocol ?? '');
  const [timeOfDay, setTimeOfDay] = useState<MeasurementTimeOfDay | null>(log.timeOfDay ?? null);
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
      const row: BodyMeasurementLog = {
        id: log.id,
        date: log.date,
        waist,
        abdomen,
        hips,
      };
      const p = protocol.trim();
      if (p) row.protocol = p;
      if (timeOfDay) row.timeOfDay = timeOfDay;
      await localUpsert('body_measurement_logs', row);
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
        aria-labelledby="measure-edit-title"
        className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl max-h-[min(92dvh,720px)] flex flex-col"
      >
        <div className="p-4 border-b border-zinc-800 shrink-0">
          <h2 id="measure-edit-title" className="text-lg font-semibold text-zinc-100">
            Edit measurements
          </h2>
          <p className="text-sm text-zinc-500 mt-1">{fmtDate(log.date, 'EEE, MMM d, yyyy')}</p>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          <p className="text-xs text-zinc-500">Waist, abdomen, and hips in inches — same as Today and Check-In.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <MeasureInput label="Waist (narrowest)" value={waist} onChange={setWaist} />
            <MeasureInput label="Abdomen (navel)" value={abdomen} onChange={setAbdomen} />
            <MeasureInput label="Hips (widest)" value={hips} onChange={setHips} />
          </div>
          <label className="block text-xs text-zinc-500">
            Protocol (optional)
            <input
              type="text"
              value={protocol}
              onChange={(e) => setProtocol(e.target.value)}
              placeholder="e.g. morning, fasted, after bathroom"
              className="mt-1 h-10 w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 text-sm text-zinc-200"
            />
          </label>
          <label className="block text-xs text-zinc-500">
            Time of day
            <select
              value={timeOfDay ?? ''}
              onChange={(e) =>
                setTimeOfDay(
                  e.target.value === '' ? null : (e.target.value as MeasurementTimeOfDay),
                )
              }
              className="mt-1 h-10 w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 text-sm text-zinc-200"
            >
              <option value="">—</option>
              {MEASUREMENT_TIME_OF_DAY.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
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
