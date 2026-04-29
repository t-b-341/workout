'use client';

import { useMemo, useState } from 'react';
import {
  MINDSET_REMINDERS,
  TRAINING_DIRECTION,
  type MindsetReminderId,
} from '@/lib/trainingPsychology';

export function TrainingMindsetCard() {
  const [activeId, setActiveId] = useState<MindsetReminderId>('intensity');
  const [directionOpen, setDirectionOpen] = useState(false);

  const active = useMemo(
    () => MINDSET_REMINDERS.find((r) => r.id === activeId) ?? MINDSET_REMINDERS[0],
    [activeId],
  );

  return (
    <div className="rounded-2xl border border-indigo-500/25 bg-gradient-to-b from-indigo-950/40 to-zinc-900 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wider text-indigo-300/90">Mindset</div>
          <div className="text-sm font-medium text-zinc-100 mt-0.5">Train with intent</div>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {MINDSET_REMINDERS.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setActiveId(r.id)}
            className={`shrink-0 h-8 px-2.5 rounded-lg text-xs font-medium transition-colors ${
              activeId === r.id
                ? 'bg-indigo-500 text-zinc-950'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <blockquote className="text-sm text-zinc-200 leading-snug border-l-2 border-indigo-500/50 pl-3">
        {active.line}
      </blockquote>
      {active.detail && (
        <p className="text-xs text-zinc-500 leading-relaxed pl-3 border-l border-zinc-700 ml-0.5">
          {active.detail}
        </p>
      )}

      <div className="pt-1 border-t border-zinc-800">
        <button
          type="button"
          onClick={() => setDirectionOpen((o) => !o)}
          className="flex w-full items-center justify-between text-left text-xs font-medium text-indigo-200/90 hover:text-indigo-100 py-1"
        >
          <span>{TRAINING_DIRECTION.headline}</span>
          <span className="text-zinc-500 tabular-nums">{directionOpen ? '−' : '+'}</span>
        </button>
        {directionOpen && (
          <ul className="mt-2 space-y-2 text-xs text-zinc-400 list-disc pl-4 marker:text-zinc-600">
            {TRAINING_DIRECTION.pillars.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-center text-sm font-semibold text-amber-400/95 tracking-wide">
          {TRAINING_DIRECTION.mantra}
        </p>
      </div>
    </div>
  );
}
