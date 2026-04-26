'use client';

import { useEffect, useState } from 'react';

/** Displays mm:ss elapsed since `since` (an ISO timestamp). Updates every
 *  second using a single setInterval shared per mount. Renders nothing if
 *  `since` is missing. Caller controls visibility (e.g., hide once next set
 *  is logged). */
export function RestTimer({ since, label = 'rested' }: { since?: string; label?: string }) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [since]);

  if (!since) return null;
  const start = Date.parse(since);
  if (Number.isNaN(start)) return null;
  const elapsed = Math.max(0, Math.floor((now - start) / 1000));
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  const tone =
    elapsed < 60 ? 'text-zinc-500'
    : elapsed < 180 ? 'text-emerald-400'
    : elapsed < 300 ? 'text-amber-400'
    : 'text-rose-400';

  return (
    <span className={`text-xs font-mono ${tone}`} aria-live="polite">
      {label} {m}:{s.toString().padStart(2, '0')}
    </span>
  );
}
