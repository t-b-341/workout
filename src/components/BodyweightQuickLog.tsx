'use client';

import { useMemo, useState } from 'react';
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

  const seed = useMemo(() => {
    if (todayRow) return todayRow.bodyweight;
    if (allBw && allBw.length > 0) return allBw[allBw.length - 1].bodyweight;
    return 200;
  }, [todayRow, allBw]);

  const formKey = useMemo(() => {
    if (todayRow) return `bw:${todayRow.date}:${todayRow.bodyweight}`;
    if (allBw === undefined) return `bw:loading:${date}`;
    return `bw:hist:${date}:${allBw.length}:${allBw[allBw.length - 1]?.bodyweight ?? 0}`;
  }, [todayRow, allBw, date]);

  return (
    <BodyweightQuickLogForm
      key={formKey}
      date={date}
      subtitle={subtitle}
      initialLb={seed}
      todayRow={todayRow}
    />
  );
}

function BodyweightQuickLogForm({
  date,
  subtitle,
  initialLb,
  todayRow,
}: {
  date: string;
  subtitle?: string;
  initialLb: number;
  todayRow: ReturnType<typeof useBodyweightForDate>;
}) {
  const [lb, setLb] = useState(initialLb);

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
