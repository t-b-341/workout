'use client';

import { useMemo, useState } from 'react';
import {
  useHydrationForDate,
  useNutritionForDate,
  useSleepForDate,
  useTodaySession,
  useReadinessForSession,
} from '@/lib/hooks';
import { buildRecoveryScore, recoveryPlan } from '@/lib/recovery';
import { localUpsert } from '@/lib/sync';
import { todayIso } from '@/lib/time';
import type { TemplateId } from '@/lib/types';

export function RecoveryView() {
  const date = todayIso();
  const nutrition = useNutritionForDate(date);
  const hydration = useHydrationForDate(date);
  const sleep = useSleepForDate(date);
  const session = useTodaySession('U1' as TemplateId);
  const readiness = useReadinessForSession(session?.id);

  const score = useMemo(
    () => buildRecoveryScore({ date, sleep, hydration, nutrition, readiness }),
    [date, sleep, hydration, nutrition, readiness],
  );
  const plan = useMemo(() => recoveryPlan(score.band), [score.band]);

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
        <div className="text-xs uppercase tracking-wider text-zinc-500">Daily recovery</div>
        <div className="text-3xl font-semibold mt-1">{score.compositeScore}</div>
        <div className="text-sm text-zinc-400 mt-1">Band: <span className="text-zinc-200 capitalize">{score.band}</span></div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <Stat label="Sleep" value={score.sleepScore} />
          <Stat label="Hydration" value={score.hydrationScore} />
          <Stat label="Nutrition" value={score.nutritionScore} />
          <Stat label="Readiness" value={score.readinessScore} />
        </div>
      </div>

      <SimpleSleepForm date={date} />
      <SimpleHydrationForm date={date} />
      <SimpleNutritionForm date={date} />

      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
        <div className="text-sm font-medium">Today&apos;s recommendations</div>
        <div className="text-sm text-zinc-300">{plan.intensityNote}</div>
        <div className="text-sm text-zinc-300">{plan.cardioNote}</div>
        <div className="text-sm text-zinc-300">{plan.nutritionNote}</div>
      </div>
    </div>
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

function SimpleSleepForm({ date }: { date: string }) {
  const existing = useSleepForDate(date);
  const [hours, setHours] = useState(existing?.sleepHours ?? 8);
  const [quality, setQuality] = useState(existing?.sleepQuality ?? 3);

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div className="text-sm font-medium">Sleep</div>
      <div className="grid grid-cols-2 gap-2">
        <input className="h-11 rounded-lg bg-zinc-950 border border-zinc-800 px-3" type="number" step="0.5" value={hours} onChange={(e) => setHours(parseFloat(e.target.value || '0'))} />
        <input className="h-11 rounded-lg bg-zinc-950 border border-zinc-800 px-3" type="number" min={1} max={5} value={quality} onChange={(e) => setQuality(parseInt(e.target.value || '3', 10) as 1 | 2 | 3 | 4 | 5)} />
      </div>
      <button className="h-11 px-4 rounded-lg bg-zinc-800 text-sm" onClick={() => localUpsert('sleep_logs', { id: `sleep-${date}`, date, sleepHours: hours, sleepQuality: quality })}>Save sleep</button>
    </div>
  );
}

function SimpleHydrationForm({ date }: { date: string }) {
  const existing = useHydrationForDate(date);
  const [actual, setActual] = useState(existing?.waterActualMl ?? 2000);
  const [target, setTarget] = useState(existing?.waterTargetMl ?? 3000);
  const [electrolytes, setElectrolytes] = useState(existing?.electrolytes ?? false);

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div className="text-sm font-medium">Hydration</div>
      <div className="grid grid-cols-2 gap-2">
        <input className="h-11 rounded-lg bg-zinc-950 border border-zinc-800 px-3" type="number" value={actual} onChange={(e) => setActual(parseFloat(e.target.value || '0'))} />
        <input className="h-11 rounded-lg bg-zinc-950 border border-zinc-800 px-3" type="number" value={target} onChange={(e) => setTarget(parseFloat(e.target.value || '0'))} />
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" checked={electrolytes} onChange={(e) => setElectrolytes(e.target.checked)} />
        Electrolytes used
      </label>
      <button className="h-11 px-4 rounded-lg bg-zinc-800 text-sm" onClick={() => localUpsert('hydration_logs', { id: `hydration-${date}`, date, waterActualMl: actual, waterTargetMl: target, electrolytes })}>Save hydration</button>
    </div>
  );
}

function SimpleNutritionForm({ date }: { date: string }) {
  const existing = useNutritionForDate(date);
  const [caloriesActual, setCaloriesActual] = useState(existing?.caloriesActual ?? 2400);
  const [caloriesTarget, setCaloriesTarget] = useState(existing?.caloriesTarget ?? 2600);
  const [proteinActual, setProteinActual] = useState(existing?.proteinActualG ?? 180);
  const [proteinTarget, setProteinTarget] = useState(existing?.proteinTargetG ?? 210);

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div className="text-sm font-medium">Nutrition</div>
      <div className="grid grid-cols-2 gap-2">
        <input className="h-11 rounded-lg bg-zinc-950 border border-zinc-800 px-3" type="number" value={caloriesActual} onChange={(e) => setCaloriesActual(parseFloat(e.target.value || '0'))} />
        <input className="h-11 rounded-lg bg-zinc-950 border border-zinc-800 px-3" type="number" value={caloriesTarget} onChange={(e) => setCaloriesTarget(parseFloat(e.target.value || '0'))} />
        <input className="h-11 rounded-lg bg-zinc-950 border border-zinc-800 px-3" type="number" value={proteinActual} onChange={(e) => setProteinActual(parseFloat(e.target.value || '0'))} />
        <input className="h-11 rounded-lg bg-zinc-950 border border-zinc-800 px-3" type="number" value={proteinTarget} onChange={(e) => setProteinTarget(parseFloat(e.target.value || '0'))} />
      </div>
      <button
        className="h-11 px-4 rounded-lg bg-zinc-800 text-sm"
        onClick={() => localUpsert('nutrition_logs', {
          id: `nutrition-${date}`,
          date,
          caloriesActual,
          caloriesTarget,
          proteinActualG: proteinActual,
          proteinTargetG: proteinTarget,
          carbsActualG: existing?.carbsActualG ?? 0,
          carbsTargetG: existing?.carbsTargetG ?? 0,
          fatActualG: existing?.fatActualG ?? 0,
          fatTargetG: existing?.fatTargetG ?? 0,
          mealsLoggedCount: existing?.mealsLoggedCount ?? 0,
        })}
      >
        Save nutrition
      </button>
    </div>
  );
}
