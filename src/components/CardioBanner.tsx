'use client';

import { useThisWeekCardio } from '@/lib/hooks';

export function CardioBanner() {
  const wk = useThisWeekCardio();
  if (!wk) return null;
  const pct = Math.min(100, Math.round((wk.total / wk.target) * 100));
  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-400">Cardio this week</span>
        <span className="font-mono text-zinc-200">{wk.total} / {wk.target} min</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
