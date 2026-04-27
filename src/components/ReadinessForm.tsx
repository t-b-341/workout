'use client';

import { useState } from 'react';
import { localUpsert } from '@/lib/sync';
import { isoWeekStringFromIsoDate } from '@/lib/time';
import { useThisWeekBodyweight } from '@/lib/hooks';
import type { ReadinessLog, SessionLog, SessionMode } from '@/lib/types';

export type ReadinessRecommendation = {
  mode: SessionMode;
  reason: string;
};

export function recommendMode(
  sleepHours: number,
  soreness: number,
  motivation: number,
): ReadinessRecommendation {
  if (motivation <= 1 || (sleepHours < 4 && soreness >= 4)) {
    return { mode: 'skip', reason: 'Energy is in the floor — take the recovery day.' };
  }
  if (motivation <= 2 || soreness >= 4 || sleepHours < 5) {
    return { mode: 'light', reason: 'Drop to a light day; keep the groove without digging the hole deeper.' };
  }
  return { mode: 'standard', reason: 'Green across the board — hit it.' };
}

export function ReadinessForm({
  session,
  onComplete,
  promptBodyweight,
}: {
  session: SessionLog;
  onComplete: () => void;
  promptBodyweight: boolean;
}) {
  const [sleep, setSleep] = useState<number>(8);
  const [soreness, setSoreness] = useState<number>(2);
  const [motivation, setMotivation] = useState<number>(3);
  const existingBw = useThisWeekBodyweight();
  const [bw, setBw] = useState<number>(245);
  const [busy, setBusy] = useState(false);
  const [recommended, setRecommended] = useState<ReadinessRecommendation | null>(null);

  const showBwInput = promptBodyweight && !existingBw;

  async function submit(applyMode: boolean) {
    setBusy(true);
    try {
      const rec = recommendMode(sleep, soreness, motivation);
      const row: ReadinessLog = {
        id: `readiness-${session.id}`,
        sessionLogId: session.id,
        date: session.date,
        sleepHours: sleep,
        soreness,
        motivation,
        bodyweight: showBwInput ? bw : undefined,
        createdAt: new Date().toISOString(),
      };
      await localUpsert('readiness_logs', row);

      if (showBwInput) {
        await localUpsert('bodyweight_logs', {
          id: `bw-${session.date}`,
          date: session.date,
          isoWeek: isoWeekStringFromIsoDate(session.date),
          bodyweight: bw,
        });
      }

      if (applyMode && rec.mode !== session.mode) {
        await localUpsert('session_logs', { ...session, mode: rec.mode });
      }
      onComplete();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-4">
      <div>
        <div className="text-sm uppercase tracking-wider text-zinc-500">Readiness check</div>
        <div className="text-lg font-medium mt-0.5">How are you walking in?</div>
      </div>

      <ReadinessSlider
        label="Sleep last night"
        unit="hrs"
        value={sleep}
        min={3}
        max={10}
        step={0.5}
        onChange={setSleep}
      />
      <ReadinessScale label="Soreness" value={soreness} onChange={setSoreness} lowLabel="None" highLabel="Severe" />
      <ReadinessScale label="Motivation" value={motivation} onChange={setMotivation} lowLabel="Dead" highLabel="Fired up" />

      {showBwInput && (
        <div className="border-t border-zinc-800 pt-3">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-zinc-400">Weekly bodyweight</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={bw}
                onChange={(e) => setBw(parseFloat(e.target.value || '0'))}
                className="h-11 w-24 rounded-lg bg-zinc-950 border border-zinc-800 px-3 text-center"
              />
              <span className="text-zinc-500 text-sm">lb</span>
            </div>
          </label>
        </div>
      )}

      {!recommended ? (
        <button
          type="button"
          onClick={() => setRecommended(recommendMode(sleep, soreness, motivation))}
          className="w-full h-12 rounded-xl bg-zinc-800 font-medium"
        >Preview recommendation</button>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500">Suggested mode</div>
            <div className={`text-lg font-medium ${
              recommended.mode === 'standard' ? 'text-emerald-400'
              : recommended.mode === 'light' ? 'text-amber-400'
              : 'text-rose-400'
            }`}>{recommended.mode === 'standard' ? 'Standard' : recommended.mode === 'light' ? 'Light day' : 'Skip — recover'}</div>
            <div className="text-xs text-zinc-500 mt-1">{recommended.reason}</div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => submit(true)}
              disabled={busy}
              className="flex-1 h-12 rounded-xl bg-amber-500 text-zinc-950 font-semibold disabled:opacity-50"
            >Accept &amp; start</button>
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={busy}
              className="flex-1 h-12 rounded-xl bg-zinc-800 disabled:opacity-50"
            >Keep current mode</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReadinessSlider({
  label, unit, value, min, max, step, onChange,
}: {
  label: string; unit: string; value: number; min: number; max: number; step: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm text-zinc-400">{label}</span>
        <span className="font-mono text-zinc-200">{value} <span className="text-xs text-zinc-500">{unit}</span></span>
      </div>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-amber-500"
      />
    </div>
  );
}

function ReadinessScale({
  label, value, onChange, lowLabel, highLabel,
}: {
  label: string; value: number; onChange: (n: number) => void;
  lowLabel: string; highLabel: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm text-zinc-400">{label}</span>
        <span className="text-xs text-zinc-500">{lowLabel} → {highLabel}</span>
      </div>
      <div className="grid grid-cols-5 gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`h-12 rounded-lg text-sm font-medium ${
              value === n ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 text-zinc-300'
            }`}
          >{n}</button>
        ))}
      </div>
    </div>
  );
}
