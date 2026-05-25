'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLifts } from '@/lib/hooks';
import {
  defaultHistoricDate,
  durationMinFromTimes,
  saveHistoricSession,
  type HistoricSetEntry,
} from '@/lib/historicSession';
import type { SetIntent, TemplateId } from '@/lib/types';

const TEMPLATE_OPTIONS: { id: TemplateId | 'custom'; label: string }[] = [
  { id: 'U1', label: 'U1' },
  { id: 'U2', label: 'U2' },
  { id: 'U3', label: 'U3' },
  { id: 'L1', label: 'L1' },
  { id: 'L2', label: 'L2' },
  { id: 'L3', label: 'L3' },
  { id: 'QUICK', label: 'QUICK' },
  { id: 'custom', label: 'Custom' },
];

const INTENT_OPTIONS: SetIntent[] = ['warmup', 'working', 'max_test'];

type Props = {
  onClose: () => void;
};

type DraftSet = HistoricSetEntry & { key: string };

function emptySet(): DraftSet {
  return {
    key: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    liftId: 'dl',
    weight: 0,
    reps: 1,
    intent: 'working',
    rpe: null,
  };
}

export function HistoricSessionSheet({ onClose }: Props) {
  const lifts = useLifts();
  const [date, setDate] = useState(defaultHistoricDate);
  const [startTime, setStartTime] = useState('20:15');
  const [endTime, setEndTime] = useState('20:30');
  const [templateChoice, setTemplateChoice] = useState<TemplateId | 'custom'>('L1');
  const [customTemplateId, setCustomTemplateId] = useState('');
  const [notes, setNotes] = useState('');
  const [sets, setSets] = useState<DraftSet[]>([emptySet()]);
  const [liftQuery, setLiftQuery] = useState<Record<string, string>>({});
  const [openLiftPicker, setOpenLiftPicker] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const templateId: TemplateId =
    templateChoice === 'custom'
      ? ((customTemplateId.trim().toUpperCase() || 'QUICK') as TemplateId)
      : templateChoice;

  const durationMin = durationMinFromTimes(date, startTime, endTime);

  const liftList = useMemo(() => {
    if (!lifts?.length) return [];
    return [...lifts].sort((a, b) => a.name.localeCompare(b.name));
  }, [lifts]);

  const liftById = useMemo(() => new Map(liftList.map((l) => [l.id, l])), [liftList]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function patchSet(key: string, patch: Partial<DraftSet>) {
    setSets((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function removeSet(key: string) {
    setSets((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.key !== key)));
  }

  async function handleSave() {
    if (!sets.length) {
      setError('Add at least one set.');
      return;
    }
    for (const row of sets) {
      if (!row.liftId || !Number.isFinite(row.weight) || row.weight <= 0) {
        setError('Each set needs a lift and weight.');
        return;
      }
      if (!Number.isFinite(row.reps) || row.reps < 1) {
        setError('Each set needs reps ≥ 1.');
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      await saveHistoricSession({
        date,
        startTime,
        endTime,
        templateId,
        notes,
        sets: sets.map(({ liftId, weight, reps, intent, rpe }) => ({
          liftId,
          weight,
          reps,
          intent,
          rpe,
        })),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save session.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center p-0 sm:p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="historic-session-title"
        className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl max-h-[min(92dvh,720px)] flex flex-col mb-14 sm:mb-0"
      >
        <div className="p-4 border-b border-zinc-800 shrink-0 flex items-center justify-between gap-2">
          <div>
            <h2 id="historic-session-title" className="text-lg font-semibold text-zinc-100">
              Add past session
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">Log a workout you already completed</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 text-xl leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-zinc-500 col-span-2 sm:col-span-1">
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 block w-full h-10 rounded-lg bg-zinc-900 border border-zinc-800 px-3 text-sm text-zinc-200"
              />
            </label>
            <div className="col-span-2 sm:col-span-1 flex gap-2">
              <label className="block text-xs text-zinc-500 flex-1">
                Start
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1 block w-full h-10 rounded-lg bg-zinc-900 border border-zinc-800 px-3 text-sm text-zinc-200"
                />
              </label>
              <label className="block text-xs text-zinc-500 flex-1">
                End
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="mt-1 block w-full h-10 rounded-lg bg-zinc-900 border border-zinc-800 px-3 text-sm text-zinc-200"
                />
              </label>
            </div>
          </div>
          {durationMin > 0 && (
            <p className="text-xs text-zinc-500">Duration: {durationMin} min</p>
          )}

          <div className="space-y-2">
            <div className="text-xs text-zinc-500">Template / session type</div>
            <div className="flex flex-wrap gap-2">
              {TEMPLATE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTemplateChoice(opt.id)}
                  className={`h-8 px-3 rounded-lg text-xs font-medium border transition-colors ${
                    templateChoice === opt.id
                      ? 'bg-amber-600 border-amber-500 text-zinc-950'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {templateChoice === 'custom' && (
              <input
                type="text"
                value={customTemplateId}
                onChange={(e) => setCustomTemplateId(e.target.value)}
                placeholder="Template id (e.g. L1)"
                className="w-full h-10 rounded-lg bg-zinc-900 border border-zinc-800 px-3 text-sm text-zinc-200 placeholder:text-zinc-600"
              />
            )}
          </div>

          <label className="block text-xs text-zinc-500">
            Session notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional"
              className="mt-1 block w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 resize-y min-h-[3rem]"
            />
          </label>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Sets</div>
              <button
                type="button"
                onClick={() => setSets((prev) => [...prev, emptySet()])}
                className="text-xs text-amber-400 hover:text-amber-300"
              >
                + Add set
              </button>
            </div>

            {sets.map((row, idx) => {
              const lift = liftById.get(row.liftId);
              const q = (liftQuery[row.key] ?? lift?.name ?? '').toLowerCase();
              const filtered = liftList.filter(
                (l) =>
                  l.id.toLowerCase().includes(q) ||
                  l.name.toLowerCase().includes(q),
              );
              const pickerOpen = openLiftPicker === row.key;

              return (
                <div
                  key={row.key}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wide text-zinc-600">
                      Set {idx + 1}
                    </span>
                    {sets.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSet(row.key)}
                        className="text-xs text-zinc-600 hover:text-rose-400"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="relative">
                    <label className="text-xs text-zinc-500">Lift</label>
                    <input
                      type="text"
                      value={pickerOpen ? (liftQuery[row.key] ?? '') : (lift?.name ?? row.liftId)}
                      onChange={(e) => {
                        setLiftQuery((prev) => ({ ...prev, [row.key]: e.target.value }));
                        setOpenLiftPicker(row.key);
                      }}
                      onFocus={() => {
                        setOpenLiftPicker(row.key);
                        setLiftQuery((prev) => ({
                          ...prev,
                          [row.key]: prev[row.key] ?? lift?.name ?? '',
                        }));
                      }}
                      placeholder="Search lifts…"
                      className="mt-1 block w-full h-9 rounded-lg bg-zinc-800 border border-zinc-700 px-3 text-sm text-zinc-200"
                    />
                    {pickerOpen && filtered.length > 0 && (
                      <ul className="absolute z-10 mt-1 w-full max-h-40 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-lg">
                        {filtered.slice(0, 12).map((l) => (
                          <li key={l.id}>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                              onClick={() => {
                                patchSet(row.key, { liftId: l.id });
                                setLiftQuery((prev) => ({ ...prev, [row.key]: l.name }));
                                setOpenLiftPicker(null);
                              }}
                            >
                              {l.name}
                              <span className="text-zinc-600 text-xs ml-2">{l.id}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-zinc-500">
                      Weight (lb)
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={5}
                        value={row.weight || ''}
                        onChange={(e) =>
                          patchSet(row.key, { weight: parseFloat(e.target.value || '0') })
                        }
                        className="mt-1 block w-full h-9 rounded-lg bg-zinc-800 border border-zinc-700 px-2 text-sm text-zinc-200 text-center"
                      />
                    </label>
                    <label className="text-xs text-zinc-500">
                      Reps
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={row.reps}
                        onChange={(e) =>
                          patchSet(row.key, { reps: parseInt(e.target.value || '1', 10) })
                        }
                        className="mt-1 block w-full h-9 rounded-lg bg-zinc-800 border border-zinc-700 px-2 text-sm text-zinc-200 text-center"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {INTENT_OPTIONS.map((intent) => (
                      <button
                        key={intent}
                        type="button"
                        onClick={() => patchSet(row.key, { intent })}
                        className={`h-7 px-2 rounded-md text-[10px] border ${
                          row.intent === intent
                            ? 'bg-zinc-600 border-zinc-500 text-zinc-100'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-500'
                        }`}
                      >
                        {intent.replace('_', ' ')}
                      </button>
                    ))}
                  </div>

                  <label className="text-xs text-zinc-500 flex items-center justify-between gap-2">
                    RPE (optional)
                    <input
                      type="number"
                      inputMode="decimal"
                      min={1}
                      max={10}
                      step={0.5}
                      value={row.rpe ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        patchSet(row.key, {
                          rpe: v === '' ? null : parseFloat(v),
                        });
                      }}
                      className="h-8 w-20 rounded-lg bg-zinc-800 border border-zinc-700 px-2 text-sm text-zinc-200 text-center"
                    />
                  </label>
                </div>
              );
            })}
          </div>

          {error && <p className="text-xs text-rose-400">{error}</p>}
        </div>

        <div className="p-4 border-t border-zinc-800 shrink-0">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSave()}
            className="w-full h-11 rounded-lg bg-amber-500 text-zinc-950 font-medium text-sm disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save session'}
          </button>
        </div>
      </div>
    </div>
  );
}
