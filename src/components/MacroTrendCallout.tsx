'use client';

import type { MacroTrendAdvice } from '@/lib/macroTrend';

export function MacroTrendCallout({
  advice,
  title = 'Fueling trend (recent days)',
  onDismiss,
}: {
  advice: MacroTrendAdvice | undefined;
  title?: string;
  onDismiss?: () => void;
}) {
  if (!advice || advice.lines.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-500/25 bg-amber-950/25 px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs uppercase tracking-wider text-amber-400/90">{title}</div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2"
          >
            Dismiss
          </button>
        )}
      </div>
      <p className="text-[11px] text-zinc-500 leading-snug">
        Based on saved logs from the days <span className="text-zinc-400">before today</span> — does not change your program or weights.
      </p>
      <ul className="space-y-1.5 text-sm text-amber-100/90 list-disc pl-4">
        {advice.lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
