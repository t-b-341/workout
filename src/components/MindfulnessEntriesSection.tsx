'use client';

import Link from 'next/link';
import { useState } from 'react';
import { flushDirty, localDelete, localUpsert } from '@/lib/sync';
import { useMindfulnessForDate } from '@/lib/hooks';
import { useWellnessTargets } from '@/lib/wellnessTargets';
import {
  clampMindfulnessEntryDuration,
  MINDFULNESS_ENTRY_DURATION_MAX,
  mindfulnessDurationTotalForDay,
} from '@/lib/mindfulnessPending';
import type { MindfulnessLog } from '@/lib/types';

function fmtCheckInTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function MindfulnessEntriesSection({
  date,
  showDailyGoalBar,
}: {
  date: string;
  /** When true, shows progress vs the wellness “daily mindfulness” goal. */
  showDailyGoalBar?: boolean;
}) {
  const entries = useMindfulnessForDate(date) ?? [];
  const wellness = useWellnessTargets();
  const dailyGoal = wellness?.mindfulnessDailyMin ?? 10;

  const [duration, setDuration] = useState(1);

  const dayTotal = mindfulnessDurationTotalForDay(entries);

  function commitDurationFromText(raw: string) {
    const digits = raw.replace(/\D/g, '');
    if (digits === '') {
      setDuration(1);
      return;
    }
    setDuration(clampMindfulnessEntryDuration(parseInt(digits.slice(0, 2), 10)));
  }

  async function addWithDuration() {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `mindfulness-${date}-${crypto.randomUUID()}`
        : `mindfulness-${date}-${Date.now()}`;
    const d = clampMindfulnessEntryDuration(duration);
    const row: MindfulnessLog = {
      id,
      date,
      loggedAt: new Date().toISOString(),
      durationMin: d,
    };
    await localUpsert('mindfulness_logs', row);
    await flushDirty().catch(() => {});
  }

  async function addTimeOnly() {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `mindfulness-${date}-${crypto.randomUUID()}`
        : `mindfulness-${date}-${Date.now()}-t`;
    const row: MindfulnessLog = {
      id,
      date,
      loggedAt: new Date().toISOString(),
    };
    await localUpsert('mindfulness_logs', row);
    await flushDirty().catch(() => {});
  }

  async function removeEntry(id: string) {
    await localDelete('mindfulness_logs', id, { undoLabel: 'Mindfulness entry' });
    await flushDirty().catch(() => {});
  }

  const sorted = [...entries].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));

  function bump(delta: number) {
    setDuration((d) => clampMindfulnessEntryDuration(d + delta));
  }

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div>
        <div className="text-sm font-medium">Meditation / mindfulness</div>
        <div className="text-xs text-zinc-500 mt-1">
          Log each session: choose minutes (1–60, ±1) or tap time-only (like a meal check-in). Multiple entries per day.
        </div>
      </div>

      {sorted.length > 0 && (
        <ul className="space-y-2">
          {sorted.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm"
            >
              <span className="font-mono text-zinc-300">
                {fmtCheckInTimestamp(e.loggedAt)}
                {e.durationMin != null ? ` · ${e.durationMin} min` : ' · time only'}
              </span>
              <button
                type="button"
                className="text-xs text-rose-300 hover:text-rose-200 shrink-0"
                onClick={() => void removeEntry(e.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-end gap-2">
          <label className="text-xs text-zinc-500">
            Minutes (1–{MINDFULNESS_ENTRY_DURATION_MAX})
            <div className="flex items-center gap-1 mt-1">
              <button
                type="button"
                aria-label="One minute less"
                onClick={() => bump(-1)}
                className="h-11 w-11 shrink-0 rounded-lg bg-zinc-800 text-lg font-medium text-zinc-100 hover:bg-zinc-700"
              >
                −
              </button>
              <input
                className="h-11 w-14 rounded-lg bg-zinc-950 border border-zinc-800 px-2 text-center font-mono text-sm"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label="Mindfulness session length in minutes"
                value={String(duration)}
                onBlur={(e) => commitDurationFromText(e.target.value)}
                onChange={(e) => {
                  let v = e.target.value.replace(/\D/g, '');
                  if (v.length > 2) v = v.slice(0, 2);
                  if (v === '') {
                    setDuration(1);
                    return;
                  }
                  const n = parseInt(v, 10);
                  if (Number.isFinite(n)) setDuration(clampMindfulnessEntryDuration(n));
                }}
              />
              <button
                type="button"
                aria-label="One minute more"
                onClick={() => bump(1)}
                className="h-11 w-11 shrink-0 rounded-lg bg-zinc-800 text-lg font-medium text-zinc-100 hover:bg-zinc-700"
              >
                +
              </button>
            </div>
          </label>
        </div>
        <button
          type="button"
          className="h-11 px-4 rounded-lg bg-violet-600 text-white text-sm font-medium shrink-0"
          onClick={() => void addWithDuration()}
        >
          Log session
        </button>
        <button
          type="button"
          className="h-11 px-4 rounded-lg bg-zinc-800 text-zinc-200 text-sm font-medium shrink-0 border border-zinc-700"
          onClick={() => void addTimeOnly()}
        >
          Time only
        </button>
      </div>

      {showDailyGoalBar !== false && (
        <>
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-zinc-500">
              <span>
                Minutes today (duration sum) · {dayTotal} / {dailyGoal} min
              </span>
              <span className="font-mono">
                {Math.min(100, dailyGoal > 0 ? Math.round((dayTotal / dailyGoal) * 100) : 0)}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className={`h-full ${dayTotal >= dailyGoal ? 'bg-emerald-500' : 'bg-sky-500'}`}
                style={{
                  width: `${Math.min(100, dailyGoal > 0 ? (dayTotal / dailyGoal) * 100 : 0)}%`,
                }}
              />
            </div>
          </div>
          <p className="text-[11px] text-right">
            <Link href="/recovery#wellness-targets" className="text-amber-400/90 hover:text-amber-300">
              Change daily or weekly goal
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
