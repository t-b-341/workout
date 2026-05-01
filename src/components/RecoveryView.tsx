'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useAllBodyweight,
  useAllNutrition,
  useHydrationForDate,
  useMacroTrendAdvice,
  useNutritionForDate,
  useSleepForDate,
  useStressForDate,
  useTodaySession,
  useReadinessForSession,
} from '@/lib/hooks';
import { buildRecoveryScore, recoveryPlan } from '@/lib/recovery';
import {
  BOTTLE_REFILL_OZ_MAX,
  mlToUsFloz,
  patchRecoveryPrefs,
  useRecoveryPrefs,
  usFlozToMl,
  type RecoveryPrefs,
} from '@/lib/recoveryPrefs';
import { kcalFromMacros } from '@/lib/macros';
import { deriveMealMetrics, sortMealTimestamps } from '@/lib/mealTiming';
import { flushDirty, localUpsert } from '@/lib/sync';
import { todayIso } from '@/lib/time';
import type { HydrationLog, NutritionLog, StressLog, TemplateId } from '@/lib/types';
import { BodyweightQuickLog } from './BodyweightQuickLog';
import { InjuryTrackingPanel } from './InjuryTrackingPanel';
import { MacroTrendCallout } from './MacroTrendCallout';
import { PageShell } from './PageShell';

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function fmtGapMinutes(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

type MacroGoal = 'maintenance' | 'deficit' | 'maingain' | 'surplus';
type TrendWindowDays = 7 | 14;

type MacroRecommendation = {
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  maintenanceEstimate: number;
  weeklyWeightChangeLb: number | null;
  reason: string;
};

function buildTodayPerformanceRecommendations(input: {
  sleepHours?: number;
  nutrition?: NutritionLog;
  stress?: StressLog;
}): string[] {
  const out: string[] = [];

  if ((input.sleepHours ?? 0) < 9) {
    out.push('Sleep earlier tonight so total sleep is at least 9 hours.');
  }

  const n = input.nutrition;
  if (n) {
    const low: string[] = [];
    const calT = kcalFromMacros(n.proteinTargetG, n.carbsTargetG, n.fatTargetG);
    const calA = kcalFromMacros(n.proteinActualG, n.carbsActualG, n.fatActualG);
    if (calA < calT) low.push('calories');
    if (n.proteinActualG < n.proteinTargetG) low.push('protein');
    if (n.carbsActualG < n.carbsTargetG) low.push('carbs');
    if (n.fatActualG < n.fatTargetG) low.push('fats');
    if (low.length > 0) {
      out.push(`Hit your macro targets today — bring up ${low.join(', ')}.`);
    }
  } else {
    out.push('Log nutrition and hit calories, protein, carbs, and fats today.');
  }

  const stressHigh = (input.stress?.average ?? 0) >= 4
    || (input.stress?.startOfDay ?? 0) >= 4
    || (input.stress?.midDay ?? 0) >= 4
    || (input.stress?.endOfDay ?? 0) >= 4;
  if (stressHigh) {
    out.push('Focus on stress reduction now: 10-minute walk + slow exhale breathing, then lower training-day friction.');
  } else {
    out.push('Focus on stress reduction anyway: keep a short walk and 2 minutes of slow breathing in your day.');
  }

  return out;
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function roundTo5(n: number): number {
  return Math.round(n / 5) * 5;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function recommendMacroTargets(opts: {
  goal: MacroGoal;
  windowDays: TrendWindowDays;
  today: string;
  bodyweights: { date: string; bodyweight: number }[];
  nutritionLogs: NutritionLog[];
  fallbackCalories: number;
}): MacroRecommendation {
  const { goal, windowDays, today, bodyweights, nutritionLogs, fallbackCalories } = opts;
  const recentStart = addDaysIso(today, -(windowDays - 1));
  const priorStart = addDaysIso(today, -(windowDays * 2 - 1));
  const priorEnd = addDaysIso(today, -windowDays);

  const recentWeights = bodyweights
    .filter((x) => x.date >= recentStart && x.date <= today)
    .map((x) => x.bodyweight);
  const priorWeights = bodyweights
    .filter((x) => x.date >= priorStart && x.date <= priorEnd)
    .map((x) => x.bodyweight);

  const recentAvg = avg(recentWeights);
  const priorAvg = avg(priorWeights);
  const weeklyWeightChangeLb =
    recentAvg != null && priorAvg != null
      ? ((recentAvg - priorAvg) / windowDays) * 7
      : null;

  const nutritionStart = addDaysIso(today, -13);
  const recentActualCalories = nutritionLogs
    .filter((x) => x.date >= nutritionStart && x.date <= today)
    .map((x) => {
      const fromMacros = kcalFromMacros(x.proteinActualG, x.carbsActualG, x.fatActualG);
      return fromMacros > 0 ? fromMacros : x.caloriesActual;
    })
    .filter((kcal) => kcal > 0);
  const observedMaintenance = avg(recentActualCalories);
  const baselineMaintenance = observedMaintenance ?? fallbackCalories;

  let trendAdjustment = 0;
  if (weeklyWeightChangeLb != null) {
    if (weeklyWeightChangeLb > 0.6) trendAdjustment = -150;
    else if (weeklyWeightChangeLb < -0.6) trendAdjustment = 150;
  }
  const maintenanceEstimate = roundTo5(clamp(baselineMaintenance + trendAdjustment, 1400, 6000));

  const goalDelta =
    goal === 'deficit' ? -400
      : goal === 'maingain' ? 150
      : goal === 'surplus' ? 300
      : 0;
  const calories = roundTo5(clamp(maintenanceEstimate + goalDelta, 1400, 6000));
  const proteinG =
    goal === 'deficit' ? 200
      : goal === 'surplus' ? 180
      : goal === 'maingain' ? 185
      : 190;
  const fatG = 75;
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4));
  const caloriesTotal = kcalFromMacros(proteinG, carbsG, fatG);

  const trendText =
    weeklyWeightChangeLb == null
      ? `Need 2 windows (${windowDays}d + prior ${windowDays}d) for trend precision.`
      : `Weight trend: ${weeklyWeightChangeLb >= 0 ? '+' : ''}${weeklyWeightChangeLb.toFixed(2)} lb/week.`;
  const reason = `${trendText} Goal set to ${goal}; protein ${proteinG}g, fat ~${fatG}g, carbs fill remaining calories.`;

  return {
    calories: caloriesTotal,
    proteinG,
    fatG,
    carbsG,
    maintenanceEstimate,
    weeklyWeightChangeLb,
    reason,
  };
}

export function RecoveryView() {
  const date = todayIso();
  const prefs = useRecoveryPrefs(); // always defined; live-updates when meta row changes
  const nutrition = useNutritionForDate(date);
  const hydration = useHydrationForDate(date);
  const sleep = useSleepForDate(date);
  const stress = useStressForDate(date);
  const session = useTodaySession('U1' as TemplateId);
  const readiness = useReadinessForSession(session?.id);

  const score = useMemo(
    () => buildRecoveryScore({ date, sleep, hydration, nutrition, readiness }),
    [date, sleep, hydration, nutrition, readiness],
  );
  const plan = useMemo(() => recoveryPlan(score.band), [score.band]);
  const performanceRecommendations = useMemo(
    () => buildTodayPerformanceRecommendations({
      sleepHours: sleep?.sleepHours,
      nutrition,
      stress,
    }),
    [sleep, nutrition, stress],
  );
  const macroTrend = useMacroTrendAdvice(date);

  return (
    <PageShell className="p-4 space-y-4">
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
        <div className="text-xs uppercase tracking-wider text-zinc-500">Daily recovery</div>
        <div className="text-3xl font-semibold mt-1">{score.compositeScore}</div>
        <div className="text-sm text-zinc-400 mt-1">
          Band: <span className="text-zinc-200 capitalize">{score.band}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <Stat label="Sleep" value={score.sleepScore} />
          <Stat label="Hydration" value={score.hydrationScore} />
          <Stat label="Nutrition" value={score.nutritionScore} />
          <Stat label="Readiness" value={score.readinessScore} />
        </div>
      </div>

      <SleepSection date={date} existing={sleep} />
      <StressSection date={date} existing={stress} />
      <InjuryTrackingPanel date={date} />
      <BodyweightQuickLog date={date} />
      <HydrationSection date={date} existing={hydration} prefs={prefs} />
      <NutritionSection date={date} existing={nutrition} prefs={prefs} />

      <MacroTrendCallout advice={macroTrend} title="Fueling trend (days before today)" />

      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
        <div className="text-sm font-medium">Today&apos;s recommendations</div>
        <div className="space-y-1.5 text-sm text-zinc-300">
          {performanceRecommendations.map((line) => (
            <div key={line}>• {line}</div>
          ))}
        </div>
        <div className="border-t border-zinc-800 pt-2" />
        <div className="text-sm text-zinc-300">{plan.intensityNote}</div>
        <div className="text-sm text-zinc-300">{plan.cardioNote}</div>
        <div className="text-sm text-zinc-300">{plan.nutritionNote}</div>
      </div>
    </PageShell>
  );
}

function StressSection({
  date,
  existing,
}: {
  date: string;
  existing: StressLog | undefined;
}) {
  const formKey = existing?.id ?? `stress-new-${date}`;
  return <StressSectionForm key={formKey} date={date} existing={existing} />;
}

function StressSectionForm({
  date,
  existing,
}: {
  date: string;
  existing: StressLog | undefined;
}) {
  const [startOfDay, setStartOfDay] = useState<1 | 2 | 3 | 4 | 5>(existing?.startOfDay ?? 3);
  const [midDay, setMidDay] = useState<1 | 2 | 3 | 4 | 5>(existing?.midDay ?? 3);
  const [endOfDay, setEndOfDay] = useState<1 | 2 | 3 | 4 | 5>(existing?.endOfDay ?? 3);
  const [managementEffectiveness, setManagementEffectiveness] = useState<1 | 2 | 3 | 4 | 5>(
    existing?.managementEffectiveness ?? 3,
  );
  const average = useMemo(() => +((startOfDay + midDay + endOfDay) / 3).toFixed(1), [startOfDay, midDay, endOfDay]);
  const highStress = startOfDay >= 4 || midDay >= 4 || endOfDay >= 4 || average >= 4;

  async function save() {
    await localUpsert('stress_logs', {
      id: `stress-${date}`,
      date,
      startOfDay,
      midDay,
      endOfDay,
      average,
      managementEffectiveness,
    });
    await flushDirty().catch(() => {});
  }

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">Stress check-ins</div>
          <div className="text-xs text-zinc-500">Rate stress 1-5 at start, mid, and end of day.</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-zinc-500">Average</div>
          <div className="font-mono text-zinc-200">{average}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <StressField label="Start" value={startOfDay} onChange={setStartOfDay} />
        <StressField label="Mid" value={midDay} onChange={setMidDay} />
        <StressField label="End" value={endOfDay} onChange={setEndOfDay} />
      </div>
      <StressField
        label="How effective are you managing stress right now? (1-5)"
        value={managementEffectiveness}
        onChange={setManagementEffectiveness}
      />
      {highStress && (
        <div className="rounded-lg border border-amber-500/35 bg-amber-950/30 p-3 text-xs text-amber-100 space-y-1">
          <div className="font-semibold">High stress detected (4+)</div>
          <div>- Take a 10-minute walk outside and breathe through your nose.</div>
          <div>- Do 2 minutes of slow exhales (4s inhale, 6-8s exhale).</div>
          <div>- Reduce stimulant load and hydrate before the next session.</div>
        </div>
      )}
      <button type="button" className="h-11 px-4 rounded-lg bg-zinc-800 text-sm w-full" onClick={() => void save()}>
        Save stress
      </button>
    </div>
  );
}

function StressField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: 1 | 2 | 3 | 4 | 5;
  onChange: (v: 1 | 2 | 3 | 4 | 5) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(String(value));

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  function commit() {
    const digits = text.replace(/\D/g, '');
    if (digits === '') {
      setText(String(value));
      return;
    }
    const n = clamp(parseInt(digits.slice(0, 2), 10), 1, 5) as 1 | 2 | 3 | 4 | 5;
    onChange(n);
    setText(String(n));
  }

  return (
    <label className="text-xs text-zinc-500">
      {label}
      <input
        className="mt-1 h-11 w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 text-center font-mono"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          commit();
          setFocused(false);
        }}
        onChange={(e) => {
          let v = e.target.value.replace(/\D/g, '');
          if (v.length > 1) v = v.slice(-1);
          setText(v);
          if (v !== '') {
            const n = parseInt(v, 10);
            if (n >= 1 && n <= 5) onChange(n as 1 | 2 | 3 | 4 | 5);
          }
        }}
      />
    </label>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-2">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function SleepSection({
  date,
  existing,
}: {
  date: string;
  existing: ReturnType<typeof useSleepForDate>;
}) {
  const formKey = existing?.id ?? `sleep-new-${date}`;
  return <SleepSectionForm key={formKey} date={date} initial={existing} />;
}

function SleepSectionForm({
  date,
  initial,
}: {
  date: string;
  initial: ReturnType<typeof useSleepForDate>;
}) {
  const [hours, setHours] = useState(initial?.sleepHours ?? 8);
  const [qualityStr, setQualityStr] = useState(() =>
    String(initial?.sleepQuality ?? 3),
  );

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div className="text-sm font-medium">Sleep</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-zinc-500">
          Hours
          <input
            className="mt-1 h-11 w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3"
            type="number"
            step="0.5"
            value={hours}
            onChange={(e) => setHours(parseFloat(e.target.value || '0'))}
          />
        </label>
        <label className="text-xs text-zinc-500">
          Quality (1–5)
          <input
            className="mt-1 h-11 w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={qualityStr}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') {
                setQualityStr('');
                return;
              }
              const n = parseInt(raw, 10);
              if (!Number.isFinite(n)) return;
              setQualityStr(String(clamp(n, 1, 5)));
            }}
          />
        </label>
      </div>
      <button
        type="button"
        className="h-11 px-4 rounded-lg bg-zinc-800 text-sm w-full"
        onClick={async () => {
          const h = clamp(Number.isFinite(hours) ? hours : 0, 0, 18);
          const parsed =
            qualityStr.trim() === '' ? NaN : parseInt(qualityStr, 10);
          const q = clamp(
            Math.round(Number.isFinite(parsed) ? parsed : 3),
            1,
            5,
          ) as 1 | 2 | 3 | 4 | 5;
          setHours(h);
          setQualityStr(String(q));
          await localUpsert('sleep_logs', {
            id: `sleep-${date}`,
            date,
            sleepHours: h,
            sleepQuality: q,
          });
          await flushDirty().catch(() => {});
        }}
      >
        Save sleep
      </button>
    </div>
  );
}

const TARGET_PRESETS_OZ = [128, 100, 96, 64] as const;

/**
 * 100% bar width = goal; emerald fills to goal; optional overflow segment for intake over goal.
 */
function GoalProgressBar({
  ratio,
  fillClassName,
  overClassName,
  ariaLabel,
}: {
  ratio: number;
  fillClassName: string;
  overClassName: string;
  ariaLabel: string;
}) {
  const r = Math.max(0, ratio);
  if (r <= 1) {
    return (
      <div
        className="mb-2 h-3 w-full rounded-full bg-zinc-800 overflow-hidden ring-1 ring-zinc-700/60"
        role="img"
        aria-label={ariaLabel}
      >
        <div
          className={`h-full rounded-r-full transition-[width] duration-150 ${fillClassName}`}
          style={{ width: `${r * 100}%` }}
        />
      </div>
    );
  }
  return (
    <div className="mb-2 w-full overflow-x-auto pb-0.5" role="img" aria-label={ariaLabel}>
      <div
        className="flex h-3 min-w-full rounded-full overflow-hidden bg-zinc-800 ring-1 ring-zinc-700/60"
        style={{ width: `${r * 100}%` }}
      >
        <div
          className={`h-full shrink-0 transition-[width] duration-150 ${fillClassName}`}
          style={{ width: `${(1 / r) * 100}%` }}
        />
        <div
          className={`h-full shrink-0 rounded-r-full transition-[width] duration-150 ${overClassName}`}
          style={{ width: `${((r - 1) / r) * 100}%` }}
        />
      </div>
    </div>
  );
}

function HydrationGoalProgressBar({ ratio }: { ratio: number }) {
  const r = Math.max(0, ratio);
  return (
    <GoalProgressBar
      ratio={r}
      fillClassName="bg-emerald-500"
      overClassName="bg-sky-500"
      ariaLabel={`Hydration ${Math.round(r * 100)} percent of daily target`}
    />
  );
}

function MacroGoalProgressBar({ ratio, label }: { ratio: number; label: string }) {
  const r = Math.max(0, ratio);
  return (
    <GoalProgressBar
      ratio={r}
      fillClassName="bg-emerald-500"
      overClassName="bg-rose-600"
      ariaLabel={`${label} ${Math.round(r * 100)} percent of target`}
    />
  );
}

function HydrationSection({
  date,
  existing,
  prefs,
}: {
  date: string;
  existing: HydrationLog | undefined;
  prefs: RecoveryPrefs;
}) {
  const formKey = existing?.id ?? `hydration-new-${date}`;
  return <HydrationSectionForm key={formKey} date={date} existing={existing} prefs={prefs} />;
}

function HydrationSectionForm({
  date,
  existing,
  prefs,
}: {
  date: string;
  existing: HydrationLog | undefined;
  prefs: RecoveryPrefs;
}) {
  const [targetMl, setTargetMl] = useState(
    existing?.waterTargetMl ?? prefs.hydrationTargetMl,
  );
  const [actualMl, setActualMl] = useState(existing?.waterActualMl ?? 0);
  const [electrolytes, setElectrolytes] = useState(existing?.electrolytes ?? false);

  function addOz(oz: number) {
    setActualMl((a) => a + usFlozToMl(oz));
  }

  async function persistPrefsTarget() {
    await patchRecoveryPrefs({ hydrationTargetMl: targetMl });
  }

  const maxActualMl = Math.max(usFlozToMl(192), Math.round(targetMl * 3), actualMl);

  const hydrationRatio = targetMl <= 0 ? 0 : actualMl / targetMl;
  const pctDisplay =
    targetMl <= 0 ? 0 : Math.round(hydrationRatio * 100);

  function targetNearPresetOz(targetMlValue: number, oz: number): boolean {
    return Math.abs(mlToUsFloz(targetMlValue) - oz) < 1;
  }

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-4">
      <div className="text-sm font-medium">Hydration</div>
      <p className="text-xs text-zinc-500">
        Default goal is <span className="text-zinc-400">128 fl oz (1 gal)</span> unless you change it below.
      </p>

      <div>
        <div className="flex justify-between text-xs text-zinc-500 mb-1">
          <span>Daily target</span>
          <span className="font-mono text-zinc-300">
            {mlToUsFloz(targetMl).toFixed(1)} fl oz · {targetMl.toLocaleString()} ml
          </span>
        </div>
        <input
          type="range"
          min={usFlozToMl(48)}
          max={usFlozToMl(256)}
          step={usFlozToMl(8)}
          value={clamp(targetMl, usFlozToMl(48), usFlozToMl(256))}
          onChange={(e) => setTargetMl(Number(e.target.value))}
          className="w-full accent-sky-500"
          aria-label="Daily water target"
        />
        <div className="flex flex-wrap gap-2 mt-2">
          {TARGET_PRESETS_OZ.map((oz) => (
            <button
              key={oz}
              type="button"
              className={`h-8 px-2 rounded-lg text-xs ${
                targetNearPresetOz(targetMl, oz) ? 'bg-sky-700' : 'bg-zinc-800'
              }`}
              onClick={() => setTargetMl(usFlozToMl(oz))}
            >
              {oz} oz
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs text-zinc-500 mb-1">
          <span>Today&apos;s intake ({pctDisplay}% of target)</span>
          <span className="font-mono text-zinc-300">
            {mlToUsFloz(actualMl).toFixed(1)} fl oz · {actualMl.toLocaleString()} ml
          </span>
        </div>
        <HydrationGoalProgressBar ratio={hydrationRatio} />
        <input
          type="range"
          min={0}
          max={maxActualMl}
          step={usFlozToMl(2)}
          value={clamp(actualMl, 0, maxActualMl)}
          onChange={(e) => setActualMl(Number(e.target.value))}
          className="w-full accent-emerald-500"
          aria-label="Today's water intake"
        />
      </div>

      <div>
        <div className="text-xs text-zinc-500 mb-2">Quick refills (add to today)</div>
        <div className="flex flex-wrap gap-2">
          {[8, 16, 32].map((oz) => (
            <button
              key={oz}
              type="button"
              className="h-9 px-3 rounded-lg bg-zinc-800 text-sm"
              onClick={() => addOz(oz)}
            >
              +{oz} oz
            </button>
          ))}
          <button
            type="button"
            className="h-9 px-3 rounded-lg bg-zinc-700 text-sm"
            onClick={() => addOz(prefs.bottleRefillOz)}
          >
            + bottle ({prefs.bottleRefillOz} oz)
          </button>
        </div>
        <label className="flex items-center gap-2 mt-3 text-xs text-zinc-400">
          Bottle size for quick button
          <select
            value={prefs.bottleRefillOz}
            onChange={async (e) => {
              const oz = Number(e.target.value);
              await patchRecoveryPrefs({ bottleRefillOz: oz });
            }}
            className="h-9 rounded-lg bg-zinc-950 border border-zinc-800 px-2"
          >
            {[8, 12, 16, 20, 24, 32, BOTTLE_REFILL_OZ_MAX].map((o) => (
              <option key={o} value={o}>
                {o === BOTTLE_REFILL_OZ_MAX ? `${o} fl oz (1 gal)` : `${o} fl oz`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" checked={electrolytes} onChange={(e) => setElectrolytes(e.target.checked)} />
        Electrolytes (training / sweat day)
      </label>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          className="h-11 px-4 rounded-lg bg-zinc-800 text-sm"
          onClick={async () => {
            await localUpsert('hydration_logs', {
              id: `hydration-${date}`,
              date,
              waterActualMl: actualMl,
              waterTargetMl: targetMl,
              electrolytes,
            });
            await flushDirty().catch(() => {});
          }}
        >
          Save hydration
        </button>
        <button
          type="button"
          className="h-10 px-4 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-400"
          onClick={() => void persistPrefsTarget()}
        >
          Save current target ({mlToUsFloz(targetMl).toFixed(0)} oz) as my default
        </button>
      </div>
    </div>
  );
}

function NutritionSection({
  date,
  existing,
  prefs,
}: {
  date: string;
  existing: NutritionLog | undefined;
  prefs: RecoveryPrefs;
}) {
  const formKey = existing?.id ?? `nutrition-new-${date}`;
  return <NutritionSectionForm key={formKey} date={date} existing={existing} prefs={prefs} />;
}

function NutritionSectionForm({
  date,
  existing,
  prefs,
}: {
  date: string;
  existing: NutritionLog | undefined;
  prefs: RecoveryPrefs;
}) {
  const allBodyweight = useAllBodyweight();
  const allNutrition = useAllNutrition();
  const nt = prefs.nutritionTargets;
  const [goal, setGoal] = useState<MacroGoal>('maintenance');
  const [trendWindow, setTrendWindow] = useState<TrendWindowDays>(14);
  const [pT, setPT] = useState(existing?.proteinTargetG ?? nt.proteinG);
  const [cT, setCT] = useState(existing?.carbsTargetG ?? nt.carbsG);
  const [fT, setFT] = useState(existing?.fatTargetG ?? nt.fatG);

  const [pA, setPA] = useState(existing?.proteinActualG ?? 0);
  const [cA, setCA] = useState(existing?.carbsActualG ?? 0);
  const [fA, setFA] = useState(existing?.fatActualG ?? 0);

  const targetKcal = useMemo(() => kcalFromMacros(pT, cT, fT), [pT, cT, fT]);
  const actualKcal = useMemo(() => kcalFromMacros(pA, cA, fA), [pA, cA, fA]);
  const fallbackCalories = useMemo(
    () => kcalFromMacros(nt.proteinG, nt.carbsG, nt.fatG),
    [nt.proteinG, nt.carbsG, nt.fatG],
  );

  const [mealTimestamps, setMealTimestamps] = useState<string[]>(() =>
    sortMealTimestamps(existing?.mealTimestamps ?? []),
  );
  const mealDerived = useMemo(() => deriveMealMetrics(mealTimestamps), [mealTimestamps]);
  const recommendation = useMemo(
    () =>
      recommendMacroTargets({
        goal,
        windowDays: trendWindow,
        today: date,
        bodyweights: allBodyweight ?? [],
        nutritionLogs: allNutrition ?? [],
        fallbackCalories,
      }),
    [goal, trendWindow, date, allBodyweight, allNutrition, fallbackCalories],
  );

  async function persistNutrition(meals: string[]) {
    const sorted = sortMealTimestamps(meals);
    setMealTimestamps(sorted);

    const migrated = existing?.mealTimestamps != null;
    let mealsLoggedCount: number;
    let mealTimestampsOut: string[] | undefined;

    if (sorted.length > 0) {
      mealsLoggedCount = sorted.length;
      mealTimestampsOut = sorted;
    } else if (!migrated && (existing?.mealsLoggedCount ?? 0) > 0) {
      mealsLoggedCount = existing!.mealsLoggedCount;
      mealTimestampsOut = undefined;
    } else {
      mealsLoggedCount = 0;
      mealTimestampsOut = [];
    }

    await localUpsert('nutrition_logs', {
      id: `nutrition-${date}`,
      date,
      caloriesTarget: targetKcal,
      caloriesActual: actualKcal,
      proteinTargetG: pT,
      proteinActualG: pA,
      carbsTargetG: cT,
      carbsActualG: cA,
      fatTargetG: fT,
      fatActualG: fA,
      mealsLoggedCount,
      ...(mealTimestampsOut !== undefined ? { mealTimestamps: mealTimestampsOut } : {}),
    });
    await flushDirty().catch(() => {});
  }

  async function saveLog() {
    await persistNutrition(mealTimestamps);
  }

  async function logAteNow() {
    await persistNutrition([...mealTimestamps, new Date().toISOString()]);
  }

  async function removeMeal(iso: string) {
    await persistNutrition(mealTimestamps.filter((x) => x !== iso));
  }

  async function saveTargetsAsDefaults() {
    await patchRecoveryPrefs({
      nutritionTargets: {
        calories: targetKcal,
        proteinG: pT,
        carbsG: cT,
        fatG: fT,
      },
    });
  }

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-4">
      <div className="text-sm font-medium">Nutrition &amp; macros</div>
      <p className="text-xs text-zinc-500">
        Calories follow macros (4 kcal/g protein &amp; carbs, 9 kcal/g fat). Edit macros below or use
        sliders as % of target per macro.
      </p>
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-3">
        <div className="text-xs uppercase tracking-wider text-zinc-500">Goal-based recommendation</div>
        <div className="flex flex-wrap gap-2">
          {([
            ['maintenance', 'Maintenance'],
            ['deficit', 'Deficit'],
            ['maingain', 'Surplus (maingain)'],
            ['surplus', 'Surplus'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setGoal(id)}
              className={`h-8 px-2.5 rounded-lg text-xs ${
                goal === id ? 'bg-amber-500 text-zinc-950 font-medium' : 'bg-zinc-800 text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-500">Trend window</span>
          {[7, 14].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setTrendWindow(n as TrendWindowDays)}
              className={`h-7 px-2 rounded-md ${
                trendWindow === n ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {n}d
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-2">
            <div className="text-zinc-500">Calories</div>
            <div className="font-mono text-zinc-200">{recommendation.calories}</div>
          </div>
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-2">
            <div className="text-zinc-500">Protein</div>
            <div className="font-mono text-zinc-200">{recommendation.proteinG}g</div>
          </div>
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-2">
            <div className="text-zinc-500">Fat</div>
            <div className="font-mono text-zinc-200">{recommendation.fatG}g</div>
          </div>
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-2">
            <div className="text-zinc-500">Carbs</div>
            <div className="font-mono text-zinc-200">{recommendation.carbsG}g</div>
          </div>
        </div>
        <div className="text-[11px] text-zinc-500">
          Estimated maintenance: <span className="font-mono text-zinc-400">{recommendation.maintenanceEstimate}</span> kcal
          {recommendation.weeklyWeightChangeLb != null && (
            <>
              {' · '}trend <span className="font-mono text-zinc-400">
                {recommendation.weeklyWeightChangeLb >= 0 ? '+' : ''}
                {recommendation.weeklyWeightChangeLb.toFixed(2)}
              </span> lb/week
            </>
          )}
        </div>
        <div className="text-xs text-zinc-500">{recommendation.reason}</div>
        <button
          type="button"
          className="h-9 px-3 rounded-lg bg-amber-500 text-zinc-950 text-xs font-medium"
          onClick={() => {
            setPT(recommendation.proteinG);
            setFT(recommendation.fatG);
            setCT(recommendation.carbsG);
          }}
        >
          Apply recommended targets
        </button>
      </div>

      <div className="space-y-3">
        <DerivedCaloriesRow
          targetKcal={targetKcal}
          actualKcal={actualKcal}
          targetMacros={{ p: pT, c: cT, f: fT }}
          setActualMacros={{ setP: setPA, setC: setCA, setF: setFA }}
        />
        <MacroRow
          macro="Protein"
          unit="g"
          target={pT}
          setTarget={setPT}
          actual={pA}
          setActual={setPA}
        />
        <MacroRow
          macro="Carbs"
          unit="g"
          target={cT}
          setTarget={setCT}
          actual={cA}
          setActual={setCA}
        />
        <MacroRow
          macro="Fat"
          unit="g"
          target={fT}
          setTarget={setFT}
          actual={fA}
          setActual={setFA}
        />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-3">
        <div className="text-xs uppercase tracking-wider text-zinc-500">Meal check-ins</div>
        <p className="text-xs text-zinc-500">
          Tap Yes when you eat; each tap saves the time. No does nothing. Times drive meal-based stats below.
        </p>
        {existing && existing.mealsLoggedCount > 0 && existing.mealTimestamps === undefined && (
          <p className="text-[11px] text-zinc-500">
            Earlier entry used manual meal count ({existing.mealsLoggedCount}). Add check-ins below to track times.
          </p>
        )}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-zinc-400 shrink-0">Did you eat?</span>
          <button
            type="button"
            className="h-10 px-4 rounded-lg bg-emerald-600 text-zinc-950 text-sm font-medium"
            onClick={() => void logAteNow()}
          >
            Yes — log time
          </button>
          <span className="text-xs text-zinc-600 px-1" title="No — nothing is recorded">
            No — nothing saved
          </span>
        </div>
        {mealTimestamps.length > 0 && (
          <ul className="space-y-1.5">
            {sortMealTimestamps(mealTimestamps).map((iso, idx) => (
              <li
                key={`${iso}-${idx}`}
                className="flex items-center justify-between gap-2 text-xs font-mono text-zinc-300 rounded-lg bg-zinc-900 px-2 py-1.5 border border-zinc-800"
              >
                <span>{new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                <button
                  type="button"
                  className="text-zinc-500 hover:text-rose-400 text-[11px] shrink-0"
                  onClick={() => void removeMeal(iso)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {mealDerived.occasions > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-2">
              <div className="text-zinc-500">Occasions</div>
              <div className="font-mono text-zinc-200 mt-0.5">{mealDerived.occasions}</div>
            </div>
            {mealDerived.firstMealTimeLabel && (
              <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-2">
                <div className="text-zinc-500">First</div>
                <div className="font-mono text-zinc-200 mt-0.5">{mealDerived.firstMealTimeLabel}</div>
              </div>
            )}
            {mealDerived.lastMealTimeLabel && (
              <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-2">
                <div className="text-zinc-500">Last</div>
                <div className="font-mono text-zinc-200 mt-0.5">{mealDerived.lastMealTimeLabel}</div>
              </div>
            )}
            {mealDerived.longestGapMinutes != null && (
              <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-2">
                <div className="text-zinc-500">Longest gap</div>
                <div className="font-mono text-zinc-200 mt-0.5">{fmtGapMinutes(mealDerived.longestGapMinutes)}</div>
              </div>
            )}
            {mealDerived.avgGapMinutes != null && (
              <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-2">
                <div className="text-zinc-500">Avg gap</div>
                <div className="font-mono text-zinc-200 mt-0.5">{fmtGapMinutes(mealDerived.avgGapMinutes)}</div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <button type="button" className="h-11 px-4 rounded-lg bg-zinc-800 text-sm" onClick={() => void saveLog()}>
          Save today&apos;s nutrition
        </button>
        <button
          type="button"
          className="h-10 px-4 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-400"
          onClick={() => void saveTargetsAsDefaults()}
        >
          Save macro targets above as my defaults
        </button>
      </div>
    </div>
  );
}

function DerivedCaloriesRow({
  targetKcal,
  actualKcal,
  targetMacros,
  setActualMacros,
}: {
  targetKcal: number;
  actualKcal: number;
  targetMacros: { p: number; c: number; f: number };
  setActualMacros: {
    setP: (n: number) => void;
    setC: (n: number) => void;
    setF: (n: number) => void;
  };
}) {
  const calRatio = targetKcal <= 0 ? 0 : actualKcal / targetKcal;
  const pctDisplay = Math.round(calRatio * 100);
  const sliderMax = Math.max(300, pctDisplay);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-2">
      <div className="flex justify-between items-baseline">
        <span className="text-sm font-medium text-zinc-200">Calories</span>
        <span className="text-xs text-zinc-500">kcal (derived)</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="text-xs text-zinc-500">
          Target
          <div className="mt-1 h-10 flex items-center rounded-lg bg-zinc-900 border border-zinc-800 px-2 font-mono text-sm text-zinc-200">
            {targetKcal}
          </div>
        </div>
        <div className="text-xs text-zinc-500">
          Today (actual)
          <div className="mt-1 h-10 flex items-center rounded-lg bg-zinc-900 border border-zinc-800 px-2 font-mono text-sm text-zinc-200">
            {actualKcal}
          </div>
        </div>
      </div>
      <MacroGoalProgressBar ratio={calRatio} label="Calories" />
      <div>
        <div className="flex justify-between text-[11px] text-zinc-500 mb-1">
          <span>Actual vs target (moves all macros)</span>
          <span className="font-mono">{pctDisplay}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={sliderMax}
          value={targetKcal <= 0 ? 0 : Math.min(sliderMax, pctDisplay)}
          disabled={targetKcal <= 0}
          title={targetKcal <= 0 ? 'Set macro targets above zero to use the slider' : undefined}
          onChange={(e) => {
            const p = Number(e.target.value);
            setActualMacros.setP(Math.round((targetMacros.p * p) / 100));
            setActualMacros.setC(Math.round((targetMacros.c * p) / 100));
            setActualMacros.setF(Math.round((targetMacros.f * p) / 100));
          }}
          className="w-full accent-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Calories percent of macro targets"
        />
      </div>
    </div>
  );
}

function MacroRow({
  macro,
  unit,
  target,
  setTarget,
  actual,
  setActual,
}: {
  macro: string;
  unit: string;
  target: number;
  setTarget: (n: number) => void;
  actual: number;
  setActual: (n: number) => void;
}) {
  const ratio = target <= 0 ? 0 : actual / target;
  const pctDisplay = Math.round(ratio * 100);
  const sliderMax = Math.max(300, pctDisplay);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-2">
      <div className="flex justify-between items-baseline">
        <span className="text-sm font-medium text-zinc-200">{macro}</span>
        <span className="text-xs text-zinc-500">{unit}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-zinc-500">
          Target
          <input
            type="number"
            min={0}
            step={5}
            value={target || ''}
            onChange={(e) => setTarget(Math.max(0, parseFloat(e.target.value || '0')))}
            className="mt-1 h-10 w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 font-mono text-sm"
          />
        </label>
        <label className="text-xs text-zinc-500">
          Today (actual)
          <input
            type="number"
            min={0}
            step={1}
            value={actual || ''}
            onChange={(e) => setActual(Math.max(0, parseFloat(e.target.value || '0')))}
            className="mt-1 h-10 w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 font-mono text-sm"
          />
        </label>
      </div>
      <MacroGoalProgressBar ratio={ratio} label={macro} />
      <div>
        <div className="flex justify-between text-[11px] text-zinc-500 mb-1">
          <span>Actual vs target</span>
          <span className="font-mono">{pctDisplay}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={sliderMax}
          value={target <= 0 ? 0 : Math.min(sliderMax, pctDisplay)}
          disabled={target <= 0}
          title={target <= 0 ? 'Set a target above zero to use the slider' : undefined}
          onChange={(e) => {
            const p = Number(e.target.value);
            setActual(Math.round((target * p) / 100));
          }}
          className="w-full accent-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={`${macro} percent of target`}
        />
      </div>
    </div>
  );
}
