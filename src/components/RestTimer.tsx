'use client';

import { useEffect, useState } from 'react';

/** Displays mm:ss elapsed since `since` (an ISO timestamp). Updates every
 *  second using a single setInterval shared per mount. Renders nothing if
 *  `since` is missing. Caller controls visibility (e.g., hide once next set
 *  is logged). */
export function RestTimer({
  since,
  label = 'rested',
  restTargetSeconds,
}: {
  since?: string;
  label?: string;
  restTargetSeconds?: number;
}) {
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
  // Cap at 30 min — past that the user isn't actually resting between sets
  // (e.g. they reloaded the app hours later), so the timer becomes noise.
  if (elapsed > 30 * 60) return null;
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
      {restTargetSeconds && elapsed < restTargetSeconds && (
        <span className="text-zinc-700 ml-1">
          / {Math.floor(restTargetSeconds / 60)}:
          {(restTargetSeconds % 60).toString().padStart(2, '0')}
        </span>
      )}
      {restTargetSeconds && elapsed >= restTargetSeconds && (
        <span className="text-emerald-400 ml-1 text-[10px]">
          ✓ ready
        </span>
      )}
    </span>
  );
}
