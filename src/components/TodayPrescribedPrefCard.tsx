'use client';

import { setHidePrescribed, useHidePrescribed } from '@/lib/todayPrefs';

export function TodayPrescribedPrefCard() {
  const hidden = useHidePrescribed();

  async function toggle() {
    await setHidePrescribed(!hidden);
  }

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
      <div className="text-xs uppercase tracking-wider text-zinc-500">Today tab</div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-zinc-200">Hide prescribed sessions on Today</div>
          <p className="text-xs text-zinc-500 mt-1">
            Hides the scheduled-session prompt and planner on the Today tab. Your Quick Session and
            trackers stay. This device only.
          </p>
        </div>
        {hidden ? (
          <button
            type="button"
            aria-pressed="true"
            aria-label="Show prescribed sessions on Today"
            onClick={() => void toggle()}
            className="shrink-0 h-9 w-14 rounded-full relative transition-colors bg-amber-500"
          >
            <span className="absolute top-1 left-6 h-7 w-7 rounded-full bg-zinc-950 transition-[left]" />
          </button>
        ) : (
          <button
            type="button"
            aria-pressed="false"
            aria-label="Hide prescribed sessions on Today"
            onClick={() => void toggle()}
            className="shrink-0 h-9 w-14 rounded-full relative transition-colors bg-zinc-700"
          >
            <span className="absolute top-1 left-1 h-7 w-7 rounded-full bg-zinc-950 transition-[left]" />
          </button>
        )}
      </div>
    </div>
  );
}
