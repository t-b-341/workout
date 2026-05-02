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

const MINDFULNESS_MINUTES_MAX = 180;

function clampMindfulnessMinutes(n: number): number {
  return Math.min(MINDFULNESS_MINUTES_MAX, Math.max(0, Math.round(n)));
}

/** Parses draft string; blank defaults to 1 min (daily default). */
function mindfulnessMinutesFromDraft(minutesStr: string): number {
  const p = parseInt(minutesStr.trim(), 10);
  return clampMindfulnessMinutes(Number.isFinite(p) ? p : 1);
}

function MindfulnessMinutesRow({
  minutesStr,
  setMinutesStr,
}: {
  minutesStr: string;
  setMinutesStr: (s: string) => void;
}) {
  const bump = (delta: number) => {
    const p = parseInt(minutesStr.trim(), 10);
    const base = Number.isFinite(p) ? p : 1;
    setMinutesStr(String(clampMindfulnessMinutes(base + delta)));
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-2">
      <div>
        <div className="text-sm text-zinc-300">Mindfulness?</div>
        <div className="text-xs text-zinc-500 mt-0.5">
          e.g. 10 minutes, app or no app · default 1 min — +/− 1 min or type another value
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
          aria-label="Mindfulness minutes"
          value={minutesStr}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              setMinutesStr('');
              return;
            }
            const n = parseInt(raw, 10);
            if (!Number.isFinite(n)) return;
            setMinutesStr(String(clampMindfulnessMinutes(n)));
          }}
          className="h-11 min-w-[4rem] flex-1 max-w-[6rem] rounded-lg bg-zinc-900 border border-zinc-800 px-2 text-center text-sm text-zinc-200"
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
    </div>
  );
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
  const [hrvRmssd, setHrvRmssd] = useState<number>(45);
  const [hrvSkipped, setHrvSkipped] = useState(false);
  const [mindfulnessStr, setMindfulnessStr] = useState('1');
  const [busy, setBusy] = useState(false);
  const [recommended, setRecommended] = useState<ReadinessRecommendation | null>(null);

  const showBwInput = promptBodyweight && !existingBw;

  async function submit(applyMode: boolean) {
    setBusy(true);
    try {
      const rec = recommendMode(sleep, soreness, motivation);
      const mindfulnessMinutes = mindfulnessMinutesFromDraft(mindfulnessStr);
      const row: ReadinessLog = {
        id: `readiness-${session.id}`,
        sessionLogId: session.id,
        date: session.date,
        sleepHours: sleep,
        soreness,
        motivation,
        hrvRmssd: hrvSkipped ? undefined : hrvRmssd,
        hrvMeasuredMin: hrvSkipped ? undefined : 5,
        hrvSkipped,
        bodyweight: showBwInput ? bw : undefined,
        mindfulnessMinutes,
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

      const completedAt = new Date().toISOString();
      let nextSession: SessionLog = {
        ...session,
        readinessCompletedAt: completedAt,
      };
      if (applyMode && rec.mode !== session.mode) {
        nextSession = { ...nextSession, mode: rec.mode };
      }
      await localUpsert('session_logs', nextSession);
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
      <MindfulnessMinutesRow minutesStr={mindfulnessStr} setMinutesStr={setMindfulnessStr} />
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-zinc-300">Morning HRV (5 min)</div>
          <button
            type="button"
            onClick={() => setHrvSkipped((v) => !v)}
            className={`text-xs px-2 py-1 rounded-md ${
              hrvSkipped ? 'bg-zinc-700 text-zinc-200' : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            {hrvSkipped ? 'HRV skipped' : 'Skip HRV'}
          </button>
        </div>
        {!hrvSkipped ? (
          <label className="flex items-center justify-between gap-3 text-xs text-zinc-500">
            RMSSD
            <input
              type="number"
              inputMode="decimal"
              min={1}
              step={0.1}
              value={hrvRmssd}
              onChange={(e) => setHrvRmssd(parseFloat(e.target.value || '0'))}
              className="h-10 w-24 rounded-lg bg-zinc-900 border border-zinc-800 px-2 text-center text-sm text-zinc-200"
            />
          </label>
        ) : (
          <div className="text-xs text-zinc-500">Skipped today; recovery score will use other readiness signals.</div>
        )}
      </div>

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

export function ReadinessSlider({
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

export function ReadinessEditForm({
  readiness,
  session,
  onDone,
}: {
  readiness: ReadinessLog;
  session: SessionLog;
  onDone: () => void;
}) {
  const [sleep, setSleep] = useState(readiness.sleepHours);
  const [soreness, setSoreness] = useState(readiness.soreness);
  const [motivation, setMotivation] = useState(readiness.motivation);
  const hadBw = readiness.bodyweight != null;
  const [bw, setBw] = useState(readiness.bodyweight ?? 0);
  const [hrvRmssd, setHrvRmssd] = useState(readiness.hrvRmssd ?? 45);
  const [hrvSkipped, setHrvSkipped] = useState(Boolean(readiness.hrvSkipped));
  const [mindfulnessStr, setMindfulnessStr] = useState(() =>
    String(readiness.mindfulnessMinutes ?? 1),
  );
  const [busy, setBusy] = useState(false);

  async function persist(applyMode: boolean) {
    setBusy(true);
    try {
      const rec = recommendMode(sleep, soreness, motivation);
      const mindfulnessMinutes = mindfulnessMinutesFromDraft(mindfulnessStr);
      const row: ReadinessLog = {
        ...readiness,
        sleepHours: sleep,
        soreness,
        motivation,
        hrvRmssd: hrvSkipped ? undefined : hrvRmssd,
        hrvMeasuredMin: hrvSkipped ? undefined : 5,
        hrvSkipped,
        bodyweight: hadBw ? bw : undefined,
        mindfulnessMinutes,
      };
      await localUpsert('readiness_logs', row);
      if (hadBw) {
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
      onDone();
    } finally {
      setBusy(false);
    }
  }

  const preview = recommendMode(sleep, soreness, motivation);

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm uppercase tracking-wider text-zinc-500">Readiness</div>
          <div className="text-lg font-medium mt-0.5">Edit check-in</div>
        </div>
        <button
          type="button"
          onClick={() => onDone()}
          disabled={busy}
          className="text-sm text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
        >
          Cancel
        </button>
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
      <MindfulnessMinutesRow minutesStr={mindfulnessStr} setMinutesStr={setMindfulnessStr} />
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-zinc-300">Morning HRV (5 min)</div>
          <button
            type="button"
            onClick={() => setHrvSkipped((v) => !v)}
            className={`text-xs px-2 py-1 rounded-md ${
              hrvSkipped ? 'bg-zinc-700 text-zinc-200' : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            {hrvSkipped ? 'HRV skipped' : 'Skip HRV'}
          </button>
        </div>
        {!hrvSkipped ? (
          <label className="flex items-center justify-between gap-3 text-xs text-zinc-500">
            RMSSD
            <input
              type="number"
              inputMode="decimal"
              min={1}
              step={0.1}
              value={hrvRmssd}
              onChange={(e) => setHrvRmssd(parseFloat(e.target.value || '0'))}
              className="h-10 w-24 rounded-lg bg-zinc-900 border border-zinc-800 px-2 text-center text-sm text-zinc-200"
            />
          </label>
        ) : (
          <div className="text-xs text-zinc-500">Skipped today; recovery score will use other readiness signals.</div>
        )}
      </div>

      {hadBw && (
        <div className="border-t border-zinc-800 pt-3">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-zinc-400">Bodyweight (with check-in)</span>
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

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-2">
        <div className="text-xs uppercase tracking-wider text-zinc-500">Suggested mode from these values</div>
        <div
          className={`text-sm font-medium ${
            preview.mode === 'standard'
              ? 'text-emerald-400'
              : preview.mode === 'light'
                ? 'text-amber-400'
                : 'text-rose-400'
          }`}
        >
          {preview.mode === 'standard' ? 'Standard' : preview.mode === 'light' ? 'Light day' : 'Skip — recover'}
        </div>
        <div className="text-xs text-zinc-500">{preview.reason}</div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => persist(false)}
          disabled={busy}
          className="flex-1 h-12 rounded-xl bg-zinc-800 font-medium disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => persist(true)}
          disabled={busy}
          className="flex-1 h-12 rounded-xl bg-amber-500 text-zinc-950 font-semibold disabled:opacity-50"
        >
          Save &amp; apply mode
        </button>
      </div>
    </div>
  );
}

export function ReadinessScale({
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
