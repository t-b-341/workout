'use client';

import { format } from 'date-fns';
import { useState } from 'react';
import { CardioBanner } from './CardioBanner';
import { CardioLogEditSheet } from './CardioLogEditSheet';
import { MindfulnessWeeklyBanner } from './MindfulnessWeeklyBanner';
import { DecimalStepper, LooseIntField } from './WeightStepper';
import { PageShell } from './PageShell';
import { useThisWeekCardio } from '@/lib/hooks';
import { localDelete, localUpsert } from '@/lib/sync';
import { resolveCardioTimestamps } from '@/lib/cardioTime';
import { todayIso, fmtDate } from '@/lib/time';
import type { CardioLog, CardioType } from '@/lib/types';

function currentLocalHm(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function isoForLocalDateTime(dateIso: string, hm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hm.trim());
  if (!m) return new Date().toISOString();
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return new Date().toISOString();
  }
  return new Date(`${dateIso}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`).toISOString();
}

const SHIFT_HOUR_OPTIONS = [6, 8.5, 10.5] as const;

/** Estimated active minutes from on-feet shift length (~20 min per clock hour). */
function activeMinutesFromShiftHours(shiftHours: number): number {
  return Math.round(shiftHours * 20);
}

function cardioEntryTitle(c: CardioLog): string {
  if (c.type === 'occupational') {
    const shift =
      c.shiftHours != null ? ` (${c.shiftHours} hr shift)` : '';
    return `On feet · ${c.durationMin} min${shift}`;
  }
  if (c.type === 'liss') return `LISS · ${c.durationMin} min`;
  return `Intervals · ${c.durationMin} min`;
}

function cardioDeleteLabel(c: CardioLog): string {
  if (c.type === 'occupational') return `On feet · ${c.durationMin} min`;
  return `${c.type === 'liss' ? 'LISS' : 'Intervals'} · ${c.durationMin} min`;
}

export function CardioView() {
  const wk = useThisWeekCardio();
  const [type, setType] = useState<CardioType>('liss');
  const [duration, setDuration] = useState(30);
  const [speed, setSpeed] = useState(2.0);
  const [grade, setGrade] = useState(3.0);
  const [lissTimeHm, setLissTimeHm] = useState(() => currentLocalHm());
  const [avgHr, setAvgHr] = useState<number | ''>('');
  const [peakHr, setPeakHr] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [editing, setEditing] = useState<CardioLog | null>(null);
  const [selectedShiftHours, setSelectedShiftHours] = useState<number>(8.5);

  async function add() {
    const id = `cardio-${Date.now()}`;
    const date = todayIso();
    if (type === 'occupational') {
      const row: CardioLog = {
        id,
        date,
        type: 'occupational',
        durationMin: duration,
        shiftHours: selectedShiftHours,
        notes: notes || undefined,
      };
      await localUpsert('cardio_logs', row);
      setNotes('');
      return;
    }
    const endedAt = type === 'liss' ? isoForLocalDateTime(date, lissTimeHm) : new Date().toISOString();
    const { startedAt, endedAt: endIso } = resolveCardioTimestamps(endedAt, duration, undefined);
    const row: CardioLog = {
      id,
      date,
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

  function selectShiftHours(hours: number) {
    setSelectedShiftHours(hours);
    setDuration(activeMinutesFromShiftHours(hours));
  }

  return (
    <PageShell className="p-4 space-y-4">
      <CardioBanner />
      <MindfulnessWeeklyBanner />

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
          <button
            type="button"
            onClick={() => {
              setType('occupational');
              setDuration(activeMinutesFromShiftHours(selectedShiftHours));
            }}
            className={`flex-1 h-11 rounded-xl text-sm ${type === 'occupational' ? 'bg-amber-500 text-zinc-950 font-medium' : 'bg-zinc-800'}`}
          >
            On feet
          </button>
        </div>

        <div className="space-y-3">
          {type === 'occupational' && (
            <div>
              <div className="text-xs text-zinc-500 mb-2">Shift duration</div>
              <div className="flex gap-2">
                {SHIFT_HOUR_OPTIONS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => selectShiftHours(h)}
                    className={`flex-1 h-10 rounded-xl text-sm ${
                      selectedShiftHours === h
                        ? 'bg-amber-500/20 border border-amber-500/50 text-amber-100 font-medium'
                        : 'bg-zinc-950 border border-zinc-800 text-zinc-400'
                    }`}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>
          )}
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
              <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
                Time occurred
                <input
                  type="time"
                  step={60}
                  value={lissTimeHm}
                  onChange={(e) => setLissTimeHm(e.target.value)}
                  className="h-11 px-3 rounded-xl bg-zinc-950 border border-zinc-800"
                />
              </label>
            </div>
          ) : type === 'intervals' ? (
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
          ) : null}
        </div>
        <input
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full h-11 px-3 rounded-xl bg-zinc-950 border border-zinc-800"
        />
        <button onClick={add} className="w-full h-12 rounded-xl bg-emerald-600 font-medium">
          Log{' '}
          {type === 'liss' ? 'LISS' : type === 'intervals' ? 'Intervals' : 'on feet'}
        </button>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm uppercase tracking-wider text-zinc-500">This week</h2>
        {(wk?.items ?? []).length === 0 && <div className="text-zinc-500 text-sm">No cardio logged yet this week.</div>}
        {(wk?.items ?? []).slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((c) => (
          <div key={c.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{cardioEntryTitle(c)}</div>
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
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setEditing(c)}
                className="text-xs text-zinc-500 px-2 py-1 rounded hover:text-amber-400"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    await localDelete('cardio_logs', c.id, {
                      undoLabel: cardioDeleteLabel(c),
                    });
                  })();
                }}
                className="text-xs text-zinc-500 px-2 py-1 rounded hover:text-rose-400"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <CardioLogEditSheet log={editing} onClose={() => setEditing(null)} />
      )}
    </PageShell>
  );
}
