'use client';

import { useEffect, useState } from 'react';
import {
  SUPPLEMENT_ITEMS,
  saveSupplements,
  type SupplementId,
  useSupplementsForDate,
} from '@/lib/supplements';

type Props = { date: string };

export function SupplementsCard({ date }: Props) {
  const stored = useSupplementsForDate(date);
  const [taken, setTaken] = useState<Record<SupplementId, boolean>>(() => ({
    zma: stored?.zma ?? false,
    d3k2: stored?.d3k2 ?? false,
    multi: stored?.multi ?? false,
    creatine: stored?.creatine ?? false,
  }));

  useEffect(() => {
    // Dexie live query hydrates async — sync local checkbox state when the row loads or edits land.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from IndexedDB
    setTaken({
      zma: stored?.zma ?? false,
      d3k2: stored?.d3k2 ?? false,
      multi: stored?.multi ?? false,
      creatine: stored?.creatine ?? false,
    });
  }, [date, stored?.zma, stored?.d3k2, stored?.multi, stored?.creatine]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void saveSupplements(date, { taken });
    }, 300);
    return () => window.clearTimeout(t);
  }, [date, taken]);

  const allDone = taken.zma && taken.d3k2 && taken.multi && taken.creatine;

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">Supplements</div>
        {allDone && (
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            All done
          </span>
        )}
      </div>
      <div className="space-y-2">
        {SUPPLEMENT_ITEMS.map(({ id, label }) => (
          <label
            key={id}
            className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer"
          >
            <input
              type="checkbox"
              className="rounded border-zinc-600"
              checked={taken[id]}
              onChange={(e) => {
                setTaken((prev) => ({ ...prev, [id]: e.target.checked }));
              }}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
