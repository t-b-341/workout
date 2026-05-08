'use client';

import { useState } from 'react';
import Link from 'next/link';
import { saveWellnessTargets, useWellnessTargets, defaultWellnessTargets } from '@/lib/wellnessTargets';

export function WellnessTargetsCard() {
  const loaded = useWellnessTargets();
  const base = loaded ?? defaultWellnessTargets();
  const loadedKey =
    loaded === undefined
      ? '__pending__'
      : `${loaded.mindfulnessDailyMin}|${loaded.mindfulnessWeeklyMin}|${loaded.cardioWeeklyMin}`;
  const [loadedKeySeen, setLoadedKeySeen] = useState(loadedKey);
  const [mindDaily, setMindDaily] = useState(String(base.mindfulnessDailyMin));
  const [mindWeekly, setMindWeekly] = useState(String(base.mindfulnessWeeklyMin));
  const [cardioWeekly, setCardioWeekly] = useState(String(base.cardioWeeklyMin));
  const [savedTick, setSavedTick] = useState(false);

  if (loadedKey !== loadedKeySeen) {
    setLoadedKeySeen(loadedKey);
    if (loaded !== undefined) {
      setMindDaily(String(loaded.mindfulnessDailyMin));
      setMindWeekly(String(loaded.mindfulnessWeeklyMin));
      setCardioWeekly(String(loaded.cardioWeeklyMin));
    }
  }

  async function save() {
    const md = parseInt(mindDaily.trim(), 10);
    const mw = parseInt(mindWeekly.trim(), 10);
    const cw = parseInt(cardioWeekly.trim(), 10);
    const d = defaultWellnessTargets();
    await saveWellnessTargets({
      mindfulnessDailyMin: Number.isFinite(md) ? md : d.mindfulnessDailyMin,
      mindfulnessWeeklyMin: Number.isFinite(mw) ? mw : d.mindfulnessWeeklyMin,
      cardioWeeklyMin: Number.isFinite(cw) ? cw : d.cardioWeeklyMin,
    });
    setSavedTick(true);
    window.setTimeout(() => setSavedTick(false), 2000);
  }

  return (
    <div id="wellness-targets" className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3 scroll-mt-4">
      <div>
        <div className="text-sm font-medium">Mindfulness &amp; cardio goals</div>
        <div className="text-xs text-zinc-500 mt-1">
          Daily mindfulness shows on Today; weekly totals use ISO week (same as the banners).{' '}
          <Link href="/cardio" className="text-amber-400 hover:text-amber-300">
            Cardio tab
          </Link>
          .
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Mindfulness · daily (min)
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={mindDaily}
            onChange={(e) => setMindDaily(e.target.value.replace(/\D/g, ''))}
            className="h-10 px-2 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-sm"
            aria-label="Daily mindfulness goal in minutes"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Mindfulness · weekly (min)
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={mindWeekly}
            onChange={(e) => setMindWeekly(e.target.value.replace(/\D/g, ''))}
            className="h-10 px-2 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-sm"
            aria-label="Weekly mindfulness goal in minutes"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Cardio · weekly (min)
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={cardioWeekly}
            onChange={(e) => setCardioWeekly(e.target.value.replace(/\D/g, ''))}
            className="h-10 px-2 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-sm"
            aria-label="Weekly cardio goal in minutes"
          />
        </label>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => void save()}
          className="h-9 px-4 rounded-lg bg-amber-500 text-zinc-950 text-sm font-medium"
        >
          Save goals
        </button>
        {savedTick && <span className="text-xs text-emerald-400">Saved</span>}
      </div>
    </div>
  );
}
