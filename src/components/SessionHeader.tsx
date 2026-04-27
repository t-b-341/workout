'use client';

import { useState } from 'react';
import type { SessionLog, SessionMode, SessionTemplate, WatchFlag } from '@/lib/types';
import { localUpsert } from '@/lib/sync';
import { fmtDate } from '@/lib/time';
import { effortLabel } from '@/lib/effort';

const FLAGS: { id: WatchFlag; label: string }[] = [
  { id: 'erectors', label: 'Erectors' },
  { id: 'elbow', label: 'Elbow' },
  { id: 'shoulder', label: 'Shoulder' },
];

export function SessionHeader({
  template,
  session,
  templates,
  onTemplateChange,
}: {
  template: SessionTemplate;
  session: SessionLog;
  templates: SessionTemplate[];
  onTemplateChange: (t: SessionTemplate) => void;
}) {
  const [showModes, setShowModes] = useState(false);

  async function setMode(mode: SessionMode) {
    await localUpsert('session_logs', { ...session, mode });
    setShowModes(false);
  }
  async function toggleDeload() {
    await localUpsert('session_logs', { ...session, deload: !session.deload });
  }
  async function toggleFlag(f: WatchFlag) {
    const next = session.watchFlags.includes(f)
      ? session.watchFlags.filter((x) => x !== f)
      : [...session.watchFlags, f];
    await localUpsert('session_logs', { ...session, watchFlags: next });
  }
  async function setEffortScale(effortScale: -1 | 0 | 1) {
    await localUpsert('session_logs', { ...session, effortScale });
  }

  const modeLabel = session.mode === 'standard' ? 'Standard' : session.mode === 'light' ? 'Light' : 'Skipped';
  const modeColor = session.mode === 'standard' ? 'bg-zinc-800' : session.mode === 'light' ? 'bg-amber-700' : 'bg-zinc-700';

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs text-zinc-500 uppercase tracking-wider">{fmtDate(session.date, 'EEEE, MMM d')}</div>
          <h1 className="text-2xl font-semibold mt-1">{template.name}</h1>
        </div>
        <select
          value={template.id}
          onChange={(e) => {
            const t = templates.find((x) => x.id === e.target.value);
            if (t) onTemplateChange(t);
          }}
          className="h-10 rounded-lg bg-zinc-900 border border-zinc-800 px-2 text-sm"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.id}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowModes(!showModes)}
          className={`h-9 px-3 rounded-lg text-sm ${modeColor}`}
        >Mode: {modeLabel}</button>
        <button
          onClick={toggleDeload}
          className={`h-9 px-3 rounded-lg text-sm ${session.deload ? 'bg-indigo-700' : 'bg-zinc-800'}`}
        >Deload: {session.deload ? 'On' : 'Off'}</button>
        <span className="h-9 px-3 rounded-lg text-sm bg-zinc-800 inline-flex items-center">
          Effort: {effortLabel(session.effortScale ?? 0)}
        </span>
        {FLAGS.map((f) => {
          const on = session.watchFlags.includes(f.id);
          return (
            <button
              key={f.id}
              onClick={() => toggleFlag(f.id)}
              className={`h-9 px-3 rounded-lg text-sm ${on ? 'bg-rose-700' : 'bg-zinc-800'}`}
            >{on ? '⚠ ' : ''}{f.label}</button>
          );
        })}
      </div>

      {showModes && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 space-y-2">
          <button onClick={() => setMode('standard')} className="w-full text-left p-3 rounded-lg bg-zinc-950">
            <div className="font-medium">Standard</div>
            <div className="text-xs text-zinc-500">Hit prescribed loads. Progression engine runs.</div>
          </button>
          <button onClick={() => setMode('light')} className="w-full text-left p-3 rounded-lg bg-zinc-950">
            <div className="font-medium text-amber-400">Light day</div>
            <div className="text-xs text-zinc-500">Suggest −20% on mains. No progression even if reps hit top.</div>
          </button>
          <button onClick={() => setMode('skip')} className="w-full text-left p-3 rounded-lg bg-zinc-950">
            <div className="font-medium text-zinc-400">Skip — extra recovery</div>
            <div className="text-xs text-zinc-500">Logs the date with reason. Don&apos;t open the lift cards.</div>
          </button>
        </div>
      )}

      {session.mode === 'light' && (
        <div className="text-xs text-amber-400">
          Light day active — main lifts shown at −20%. Progression won&apos;t advance even if you hit the top of the range.
        </div>
      )}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 space-y-2">
        <div className="text-xs text-zinc-400">
          Effort scaling (no RPE needed): choose how hard today should feel.
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEffortScale(-1)}
            className={`h-9 px-3 rounded-lg text-sm ${(session.effortScale ?? 0) === -1 ? 'bg-amber-700' : 'bg-zinc-800'}`}
          >
            Easier (−10% load, −1 set)
          </button>
          <button
            type="button"
            onClick={() => setEffortScale(0)}
            className={`h-9 px-3 rounded-lg text-sm ${(session.effortScale ?? 0) === 0 ? 'bg-emerald-700' : 'bg-zinc-800'}`}
          >
            Normal
          </button>
          <button
            type="button"
            onClick={() => setEffortScale(1)}
            className={`h-9 px-3 rounded-lg text-sm ${(session.effortScale ?? 0) === 1 ? 'bg-indigo-700' : 'bg-zinc-800'}`}
          >
            Harder (+5% load, +1 set)
          </button>
        </div>
      </div>
      {session.deload && (
        <div className="text-xs text-indigo-400">
          Deload active — mains shown at 60%; halve accessory sets. No progression.
        </div>
      )}
    </div>
  );
}
