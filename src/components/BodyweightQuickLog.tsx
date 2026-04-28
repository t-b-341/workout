'use client';

import { useEffect, useRef, useState } from 'react';
import { useAllBodyweight, useBodyweightForDate } from '@/lib/hooks';
import { flushDirty, localUpsert } from '@/lib/sync';
import { isoWeekStringFromIsoDate } from '@/lib/time';

type Props = {
  /** Calendar day `YYYY-MM-DD` (usually `todayIso()`). */
  date: string;
  /** Extra context under the title. */
  subtitle?: string;
};

export function BodyweightQuickLog({ date, subtitle }: Props) {
  const todayRow = useBodyweightForDate(date);
  const allBw = useAllBodyweight();
  const [lb, setLb] = useState(200);
  const seededFromHistory = useRef(false);

  useEffect(() => {
    seededFromHistory.current = false;
  }, [date]);

  useEffect(() => {
    if (todayRow) {
      setLb(todayRow.bodyweight);
      return;
    }
    if (allBw === undefined) return;
    const last = allBw[allBw.length - 1];
    if (!last) return;
    if (seededFromHistory.current) return;
    seededFromHistory.current = true;
    setLb(last.bodyweight);
  }, [todayRow, allBw]);

  async function save() {
    await localUpsert('bodyweight_logs', {
      id: `bw-${date}`,
      date,
      isoWeek: isoWeekStringFromIsoDate(date),
      bodyweight: lb,
    });
    await flushDirty().catch(() => {});
  }

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
      <div>
        <div className="text-xs uppercase tracking-wider text-zinc-500">Bodyweight</div>
        <div className="text-sm font-medium text-zinc-200 mt-0.5">Log any day</div>
        {subtitle && <div className="text-xs text-zinc-500 mt-1">{subtitle}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          value={lb}
          onChange={(e) => setLb(parseFloat(e.target.value || '0'))}
          className="h-11 w-28 rounded-lg bg-zinc-950 border border-zinc-800 px-3 text-center font-mono"
          aria-label="Bodyweight in lb"
        />
        <span className="text-zinc-500 text-sm">lb</span>
        <button
          type="button"
          onClick={() => void save()}
          className="ml-auto h-11 px-4 rounded-lg bg-zinc-800 text-sm font-medium"
        >
          {todayRow ? 'Update' : 'Save'}
        </button>
      </div>
      {todayRow && (
        <div className="text-xs text-zinc-500">Saved for {date}</div>
      )}
    </div>
  );
}
