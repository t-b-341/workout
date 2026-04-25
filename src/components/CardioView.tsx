'use client';

import { useState } from 'react';
import { CardioBanner } from './CardioBanner';
import { useThisWeekCardio } from '@/lib/hooks';
import { localDelete, localUpsert } from '@/lib/sync';
import { todayIso, fmtDate } from '@/lib/time';
import type { CardioLog, CardioType } from '@/lib/types';

export function CardioView() {
  const wk = useThisWeekCardio();
  const [type, setType] = useState<CardioType>('liss');
  const [duration, setDuration] = useState(30);
  const [speed, setSpeed] = useState(2.0);
  const [grade, setGrade] = useState(3.0);
  const [avgHr, setAvgHr] = useState<number | ''>('');
  const [peakHr, setPeakHr] = useState<number | ''>('');
  const [notes, setNotes] = useState('');

  async function add() {
    const id = `cardio-${Date.now()}`;
    const row: CardioLog = {
      id,
      date: todayIso(),
      type,
      durationMin: duration,
      ...(type === 'liss' ? { speedMph: speed, gradePct: grade } : {}),
      ...(type === 'intervals' ? { avgHr: avgHr || undefined, peakHr: peakHr || undefined } : {}),
      notes: notes || undefined,
    };
    await localUpsert('cardio_logs', row);
    setNotes('');
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <CardioBanner />

      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
        <div className="flex gap-2">
          <button
            onClick={() => setType('liss')}
            className={`flex-1 h-11 rounded-xl ${type === 'liss' ? 'bg-amber-500 text-zinc-950 font-medium' : 'bg-zinc-800'}`}
          >LISS</button>
          <button
            onClick={() => setType('intervals')}
            className={`flex-1 h-11 rounded-xl ${type === 'intervals' ? 'bg-amber-500 text-zinc-950 font-medium' : 'bg-zinc-800'}`}
          >Intervals</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Duration (min)" value={duration} onChange={setDuration} step={1} />
          {type === 'liss' ? (
            <>
              <Field label="Speed (mph)" value={speed} onChange={setSpeed} step={0.1} />
              <Field label="Grade (%)"  value={grade} onChange={setGrade} step={0.5} />
            </>
          ) : (
            <>
              <Field label="Avg HR" value={avgHr === '' ? 0 : avgHr} onChange={(n) => setAvgHr(n)} step={1} />
              <Field label="Peak HR" value={peakHr === '' ? 0 : peakHr} onChange={(n) => setPeakHr(n)} step={1} />
            </>
          )}
        </div>
        <input
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full h-11 px-3 rounded-xl bg-zinc-950 border border-zinc-800"
        />
        <button onClick={add} className="w-full h-12 rounded-xl bg-emerald-600 font-medium">
          Log {type === 'liss' ? 'LISS' : 'Intervals'}
        </button>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm uppercase tracking-wider text-zinc-500">This week</h2>
        {(wk?.items ?? []).length === 0 && <div className="text-zinc-500 text-sm">No cardio logged yet this week.</div>}
        {(wk?.items ?? []).slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((c) => (
          <div key={c.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{c.type === 'liss' ? 'LISS' : 'Intervals'} · {c.durationMin} min</div>
              <div className="text-xs text-zinc-500 mt-0.5">
                {fmtDate(c.date)}
                {c.speedMph != null && ` · ${c.speedMph} mph @ ${c.gradePct}%`}
                {c.avgHr != null && ` · avg HR ${c.avgHr}`}
                {c.peakHr != null && ` · peak ${c.peakHr}`}
              </div>
              {c.notes && <div className="text-xs text-zinc-500 mt-0.5">{c.notes}</div>}
            </div>
            <button
              onClick={() => localDelete('cardio_logs', c.id)}
              className="text-xs text-zinc-500 px-2 py-1 rounded hover:text-rose-400"
            >Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, step }: { label: string; value: number; onChange: (n: number) => void; step: number }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value || '0'))}
        className="h-11 px-3 rounded-xl bg-zinc-950 border border-zinc-800"
      />
    </label>
  );
}
