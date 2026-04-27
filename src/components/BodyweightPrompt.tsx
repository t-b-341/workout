'use client';

import { useState } from 'react';
import { useThisWeekBodyweight } from '@/lib/hooks';
import { localUpsert } from '@/lib/sync';
import { isoWeekString, isoWeekStringFromIsoDate, todayIso } from '@/lib/time';

/** Shows on Tuesday (template L1) if no entry this ISO week. */
export function BodyweightPrompt({ visible }: { visible: boolean }) {
  const existing = useThisWeekBodyweight();
  const [bw, setBw] = useState<number>(245);
  const [submitted, setSubmitted] = useState(false);

  if (!visible || existing || submitted) return null;

  return (
    <div className="rounded-xl bg-amber-950/40 border border-amber-700 p-3 space-y-2">
      <div className="text-sm text-amber-200">
        Weekly bodyweight check — <span className="text-amber-300">{isoWeekString()}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          value={bw}
          onChange={(e) => setBw(parseFloat(e.target.value || '0'))}
          className="h-11 w-28 rounded-lg bg-zinc-900 border border-zinc-800 px-3 text-center"
        />
        <span className="text-zinc-400 text-sm">lb</span>
        <button
          onClick={async () => {
            const d = todayIso();
            await localUpsert('bodyweight_logs', {
              id: `bw-${d}`,
              date: d,
              isoWeek: isoWeekStringFromIsoDate(d),
              bodyweight: bw,
            });
            setSubmitted(true);
          }}
          className="ml-auto h-11 px-4 rounded-lg bg-amber-600 text-zinc-950 font-medium"
        >Save</button>
      </div>
    </div>
  );
}
