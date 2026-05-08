'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import {
  dayNotesMetaKey,
  normalizeDayNotesValue,
  saveDayNotes,
} from '@/lib/dayNotes';
import { getDb } from '@/lib/db';

type Props = { date: string };

function DayNotesEditor({ date, stored }: { date: string; stored: string }) {
  const [draft, setDraft] = useState(stored);
  const [focused, setFocused] = useState(false);
  const displayValue = focused ? draft : stored;

  useEffect(() => {
    if (!focused) return;
    const t = window.setTimeout(() => {
      void saveDayNotes(date, draft);
    }, 450);
    return () => window.clearTimeout(t);
  }, [date, draft, focused]);

  const onBlur = () => {
    setFocused(false);
    void saveDayNotes(date, draft);
  };

  return (
    <textarea
      value={displayValue}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => {
        setDraft(stored);
        setFocused(true);
      }}
      onBlur={onBlur}
      placeholder="Optional · a sentence or two…"
      rows={3}
      className="w-full min-h-[5.5rem] rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 resize-y"
      aria-label="Day notes"
    />
  );
}

/**
 * Free-text “how today feels” for **this calendar day** (not per session template).
 * Stored in Dexie `meta` for future analysis (e.g. craving a lift vs low motivation).
 */
export function DayNotesCard({ date }: Props) {
  const metaKey = dayNotesMetaKey(date);
  const metaRow = useLiveQuery(
    () => getDb().meta.where('key').equals(metaKey).first(),
    [metaKey],
  );
  const stored = normalizeDayNotesValue(metaRow?.value).text;

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
      <div>
        <div className="text-sm font-medium">Day&apos;s notes</div>
        <p className="text-xs text-zinc-500 mt-1">
          Mood, energy, what you&apos;re craving (e.g. &quot;want to deadlift&quot;), or &quot;not feeling it&quot; —
          for you now; future versions can use this alongside check-in signals (not analyzed in-app yet).
        </p>
      </div>
      <DayNotesEditor key={date} date={date} stored={stored} />
    </div>
  );
}
