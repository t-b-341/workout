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
import {
  BOTTLE_REFILL_OZ_MAX,
  mlToUsFloz,
  patchRecoveryPrefs,
  useRecoveryPrefs,
  usFlozToMl,
  type RecoveryPrefs,
} from '@/lib/recoveryPrefs';
import { flushDirty, localUpsert } from '@/lib/sync';
import { todayIso } from '@/lib/time';
import type { HydrationLog, NutritionLog, TemplateId } from '@/lib/types';
import { BodyweightQuickLog } from './BodyweightQuickLog';
import { PageShell } from './PageShell';

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function RecoveryView() {
  const date = todayIso();
  const prefs = useRecoveryPrefs(); // always defined; live-updates when meta row changes
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
      <BodyweightQuickLog date={date} />
      <HydrationSection date={date} existing={hydration} prefs={prefs} />
      <NutritionSection date={date} existing={nutrition} prefs={prefs} />

      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
        <div className="text-sm font-medium">Today&apos;s recommendations</div>
        <div className="text-sm text-zinc-300">{plan.intensityNote}</div>
        <div className="text-sm text-zinc-300">{plan.cardioNote}</div>
        <div className="text-sm text-zinc-300">{plan.nutritionNote}</div>
      </div>
    </PageShell>
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
  const [quality, setQuality] = useState(initial?.sleepQuality ?? 3);

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
            type="number"
            min={1}
            max={5}
            value={quality}
            onChange={(e) =>
              setQuality(clamp(parseInt(e.target.value || '3', 10), 1, 5) as 1 | 2 | 3 | 4 | 5)
            }
          />
        </label>
      </div>
      <button
        type="button"
        className="h-11 px-4 rounded-lg bg-zinc-800 text-sm w-full"
        onClick={async () => {
          const h = clamp(Number.isFinite(hours) ? hours : 0, 0, 18);
          const q = clamp(Math.round(Number.isFinite(quality) ? quality : 3), 1, 5) as 1 | 2 | 3 | 4 | 5;
          setHours(h);
          setQuality(q);
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

  const maxActualMl = Math.max(usFlozToMl(192), Math.round(targetMl * 1.5), actualMl);

  const pctOfTarget =
    targetMl <= 0 ? 0 : clamp(Math.round((actualMl / targetMl) * 100), 0, 150);

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
          <span>Today&apos;s intake ({pctOfTarget}% of target)</span>
          <span className="font-mono text-zinc-300">
            {mlToUsFloz(actualMl).toFixed(1)} fl oz · {actualMl.toLocaleString()} ml
          </span>
        </div>
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
  const nt = prefs.nutritionTargets;
  const [calT, setCalT] = useState(
    existing?.caloriesTarget ?? nt.calories,
  );
  const [pT, setPT] = useState(existing?.proteinTargetG ?? nt.proteinG);
  const [cT, setCT] = useState(existing?.carbsTargetG ?? nt.carbsG);
  const [fT, setFT] = useState(existing?.fatTargetG ?? nt.fatG);

  const [calA, setCalA] = useState(existing?.caloriesActual ?? 0);
  const [pA, setPA] = useState(existing?.proteinActualG ?? 0);
  const [cA, setCA] = useState(existing?.carbsActualG ?? 0);
  const [fA, setFA] = useState(existing?.fatActualG ?? 0);

  const [meals, setMeals] = useState(existing?.mealsLoggedCount ?? 0);

  async function saveLog() {
    await localUpsert('nutrition_logs', {
      id: `nutrition-${date}`,
      date,
      caloriesTarget: calT,
      caloriesActual: calA,
      proteinTargetG: pT,
      proteinActualG: pA,
      carbsTargetG: cT,
      carbsActualG: cA,
      fatTargetG: fT,
      fatActualG: fA,
      mealsLoggedCount: meals,
    });
    await flushDirty().catch(() => {});
  }

  async function saveTargetsAsDefaults() {
    await patchRecoveryPrefs({
      nutritionTargets: {
        calories: calT,
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
        Set daily targets, then log today&apos;s actuals (inputs or sliders as % of target).
      </p>

      <div className="space-y-3">
        <MacroRow
          macro="Calories"
          unit="kcal"
          target={calT}
          setTarget={setCalT}
          actual={calA}
          setActual={setCalA}
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

      <label className="flex items-center justify-between gap-2 text-sm text-zinc-400">
        Meals logged today
        <input
          type="number"
          min={0}
          max={12}
          value={meals}
          onChange={(e) => setMeals(clamp(parseInt(e.target.value || '0', 10), 0, 12))}
          className="h-10 w-20 rounded-lg bg-zinc-950 border border-zinc-800 px-2 text-center"
        />
      </label>

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
  const pctVal =
    target <= 0 ? 0 : clamp(Math.round((actual / target) * 100), 0, 150);

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
            step={macro === 'Calories' ? 50 : 5}
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
            step={macro === 'Calories' ? 10 : 1}
            value={actual || ''}
            onChange={(e) => setActual(Math.max(0, parseFloat(e.target.value || '0')))}
            className="mt-1 h-10 w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 font-mono text-sm"
          />
        </label>
      </div>
      <div>
        <div className="flex justify-between text-[11px] text-zinc-500 mb-1">
          <span>Actual vs target</span>
          <span className="font-mono">{pctVal}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={150}
          value={pctVal}
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
