'use client';

import { useEffect, useState } from 'react';
import {
  SUPPLEMENT_ITEMS,
  normalizeSupplementsValue,
  saveSupplements,
  type SupplementId,
  useSupplementsForDate,
} from '@/lib/supplements';

type Props = { date: string };

export function SupplementsCard({ date }: Props) {
  const metaRow = useSupplementsForDate(date);
  const stored = normalizeSupplementsValue(metaRow?.value);
  const [taken, setTaken] = useState<Record<SupplementId, boolean>>(() => ({
    zma: stored.taken.zma ?? false,
    d3k2: stored.taken.d3k2 ?? false,
    multi: stored.taken.multi ?? false,
    creatine: stored.taken.creatine ?? false,
  }));

  useEffect(() => {
    // Dexie live query hydrates async — sync local checkbox state when the row loads or edits land.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from IndexedDB meta
    setTaken({
      zma: stored.taken.zma ?? false,
      d3k2: stored.taken.d3k2 ?? false,
      multi: stored.taken.multi ?? false,
      creatine: stored.taken.creatine ?? false,
    });
  }, [date, stored.taken.zma, stored.taken.d3k2, stored.taken.multi, stored.taken.creatine]);

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
