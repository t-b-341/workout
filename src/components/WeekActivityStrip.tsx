'use client';

import { eachDayOfInterval, format } from 'date-fns';
import { useWeekActivityDates } from '@/lib/hooks';
import { fmtDate, todayIso, weekRange } from '@/lib/time';

/** Mon–Sun dots for the current ISO week (strength session or cardio logged). */
export function WeekActivityStrip() {
  const activeDates = useWeekActivityDates();
  const { start, end } = weekRange();
  const days = eachDayOfInterval({ start, end });
  const today = todayIso();

  if (!activeDates) {
    return (
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-500">
        Week view…
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 px-3 py-2"
      role="group"
      aria-label="This week training days"
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[11px] uppercase tracking-wider text-zinc-500">This week</span>
        <span className="text-[11px] text-zinc-600 font-mono">{fmtDate(start, 'MMM d')}–{fmtDate(end, 'MMM d')}</span>
      </div>
      <div className="flex justify-between gap-1">
        {days.map((d) => {
          const iso = format(d, 'yyyy-MM-dd');
          const dow = fmtDate(iso, 'EEE');
          const isToday = iso === today;
          const hit = activeDates.includes(iso);
          return (
            <div key={iso} className="flex flex-col items-center gap-1 min-w-0 flex-1">
              <span className={`text-[10px] uppercase truncate w-full text-center ${isToday ? 'text-amber-400' : 'text-zinc-500'}`}>
                {dow}
              </span>
              <span
                className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                  hit ? 'bg-emerald-500' : 'bg-zinc-700'
                } ${isToday ? 'ring-2 ring-amber-500/60 ring-offset-2 ring-offset-zinc-900' : ''}`}
                aria-label={`${iso}${hit ? ', logged' : ', rest'}${isToday ? ', today' : ''}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
