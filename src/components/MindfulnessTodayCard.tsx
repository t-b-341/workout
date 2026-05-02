'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { getDb } from '@/lib/db';
import {
  clampMindfulnessMinutes,
  mindfulnessPendingMetaKey,
  MINDFULNESS_MINUTES_MAX,
} from '@/lib/mindfulnessPending';
import { localUpsert } from '@/lib/sync';
import type { ReadinessLog, SessionLog } from '@/lib/types';

function minutesFromDraft(minutesStr: string): number {
  const p = parseInt(minutesStr.trim(), 10);
  return clampMindfulnessMinutes(Number.isFinite(p) ? p : 1);
}

/** Today-tab mindfulness minutes: persists to `readiness_logs` when a check-in exists, else `meta` until submit. */
export function MindfulnessTodayCard({
  session,
  readiness,
}: {
  session: SessionLog;
  readiness: ReadinessLog | undefined;
}) {
  const pendingKey = mindfulnessPendingMetaKey(session.id);
  const metaRow = useLiveQuery(
    () => getDb().meta.where('key').equals(pendingKey).first(),
    [pendingKey],
  );
  const pendingMinutes =
    metaRow?.value && typeof metaRow.value === 'object'
      ? (metaRow.value as { minutes?: unknown }).minutes
      : undefined;
  const pendingNum =
    typeof pendingMinutes === 'number' && Number.isFinite(pendingMinutes)
      ? clampMindfulnessMinutes(pendingMinutes)
      : undefined;

  const resolved =
    readiness?.mindfulnessMinutes ??
    pendingNum ??
    1;

  const [minutesStr, setMinutesStr] = useState(String(resolved));

  useEffect(() => {
    setMinutesStr(String(resolved));
  }, [resolved, readiness?.id, pendingNum]);

  async function persistMinutes(m: number) {
    const v = clampMindfulnessMinutes(m);
    if (readiness) {
      await localUpsert('readiness_logs', { ...readiness, mindfulnessMinutes: v });
      await getDb().meta.delete(pendingKey);
    } else {
      await getDb().meta.put({ key: pendingKey, value: { minutes: v } });
    }
  }

  const bump = (delta: number) => {
    const p = parseInt(minutesStr.trim(), 10);
    const base = Number.isFinite(p) ? p : 1;
    const next = clampMindfulnessMinutes(base + delta);
    setMinutesStr(String(next));
    void persistMinutes(next);
  };

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div>
        <div className="text-sm font-medium">Meditation / mindfulness</div>
        <div className="text-xs text-zinc-500 mt-1">
          Minutes today (app or unguided). Saved here separately from the daily check-in. Max {MINDFULNESS_MINUTES_MAX} min.
        </div>
      </div>
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          aria-label="One minute less"
          onClick={() => bump(-1)}
          className="h-11 w-11 shrink-0 rounded-lg bg-zinc-800 text-lg font-medium leading-none text-zinc-100 hover:bg-zinc-700"
        >
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label="Mindfulness minutes today"
          value={minutesStr}
          onChange={(e) => {
            const raw = e.target.value;
            setMinutesStr(raw);
            if (raw === '') return;
            const n = parseInt(raw, 10);
            if (!Number.isFinite(n)) return;
            void persistMinutes(clampMindfulnessMinutes(n));
          }}
          onBlur={() => {
            const v = minutesFromDraft(minutesStr);
            setMinutesStr(String(v));
            void persistMinutes(v);
          }}
          className="h-11 min-w-[4rem] flex-1 max-w-[6rem] rounded-lg bg-zinc-950 border border-zinc-800 px-2 text-center text-sm text-zinc-200"
        />
        <button
          type="button"
          aria-label="One minute more"
          onClick={() => bump(1)}
          className="h-11 w-11 shrink-0 rounded-lg bg-zinc-800 text-lg font-medium leading-none text-zinc-100 hover:bg-zinc-700"
        >
          +
        </button>
        <span className="text-xs text-zinc-500 shrink-0 w-8">min</span>
      </div>
      {!readiness && (
        <p className="text-[11px] text-zinc-500">
          After you complete the daily check-in, this value is stored on that log. Until then it stays on this device only.
        </p>
      )}
    </div>
  );
}
