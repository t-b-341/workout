'use client';

import { format } from 'date-fns';
import { useState } from 'react';
import { CardioBanner } from './CardioBanner';
import { DecimalStepper, LooseIntField } from './WeightStepper';
import { PageShell } from './PageShell';
import { useThisWeekCardio } from '@/lib/hooks';
import { localDelete, localUpsert } from '@/lib/sync';
import { resolveCardioTimestamps } from '@/lib/cardioTime';
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
    const endedAt = new Date().toISOString();
    const { startedAt, endedAt: endIso } = resolveCardioTimestamps(endedAt, duration, undefined);
    const row: CardioLog = {
      id,
      date: todayIso(),
      type,
      durationMin: duration,
      startedAt,
      endedAt: endIso,
      ...(type === 'liss' ? { speedMph: speed, gradePct: grade } : {}),
      ...(type === 'intervals' ? { avgHr: avgHr || undefined, peakHr: peakHr || undefined } : {}),
      notes: notes || undefined,
    };
    await localUpsert('cardio_logs', row);
    setNotes('');
  }

  return (
    <PageShell className="p-4 space-y-4">
      <CardioBanner />

      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
        <p className="text-xs text-zinc-500">
          For time-based rest tracking with a start/stop duration and in-session speed/grade, use the
          cardio block on <span className="text-zinc-300">Today</span> (programmed as a lift).
        </p>
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

        <div className="space-y-3">
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
          {type === 'liss' ? (
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
                {c.startedAt && c.endedAt && (
                  <span className="text-zinc-600">
                    {' '}
                    · {format(new Date(c.startedAt), 'h:mm a')}–{format(new Date(c.endedAt), 'h:mm a')}
                  </span>
                )}
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
    </PageShell>
  );
}
