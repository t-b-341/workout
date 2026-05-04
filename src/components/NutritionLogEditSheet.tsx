'use client';

import { useEffect, useMemo, useState } from 'react';
import { kcalFromMacros } from '@/lib/macros';
import { deriveMealMetrics, sortMealTimestamps } from '@/lib/mealTiming';
import { flushDirty, localUpsert } from '@/lib/sync';
import { fmtDate } from '@/lib/time';
import type { NutritionLog } from '@/lib/types';

/** Copied from RecoveryView nutrition form — keeps History edits aligned with Check-In. */
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
          Actual
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
          Actual
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

export function NutritionLogEditSheet({
  log,
  onClose,
}: {
  log: NutritionLog;
  onClose: () => void;
}) {
  const [pT, setPT] = useState(log.proteinTargetG);
  const [cT, setCT] = useState(log.carbsTargetG);
  const [fT, setFT] = useState(log.fatTargetG);
  const [pA, setPA] = useState(log.proteinActualG);
  const [cA, setCA] = useState(log.carbsActualG);
  const [fA, setFA] = useState(log.fatActualG);
  const [mealTimestamps, setMealTimestamps] = useState<string[]>(() =>
    sortMealTimestamps(log.mealTimestamps ?? []),
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const targetKcal = useMemo(() => kcalFromMacros(pT, cT, fT), [pT, cT, fT]);
  const actualKcal = useMemo(() => kcalFromMacros(pA, cA, fA), [pA, cA, fA]);
  const mealDerived = useMemo(() => deriveMealMetrics(mealTimestamps), [mealTimestamps]);

  async function persistMeals(meals: string[]) {
    const sorted = sortMealTimestamps(meals);
    setMealTimestamps(sorted);

    const migrated = log.mealTimestamps != null;
    let mealsLoggedCount: number;
    let mealTimestampsOut: string[] | undefined;

    if (sorted.length > 0) {
      mealsLoggedCount = sorted.length;
      mealTimestampsOut = sorted;
    } else if (!migrated && (log.mealsLoggedCount ?? 0) > 0) {
      mealsLoggedCount = log.mealsLoggedCount;
      mealTimestampsOut = undefined;
    } else {
      mealsLoggedCount = 0;
      mealTimestampsOut = [];
    }

    await localUpsert('nutrition_logs', {
      id: log.id,
      date: log.date,
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

  async function save() {
    setBusy(true);
    try {
      await persistMeals(mealTimestamps);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function logAteNow() {
    await persistMeals([...mealTimestamps, new Date().toISOString()]);
  }

  async function removeMeal(iso: string) {
    await persistMeals(mealTimestamps.filter((x) => x !== iso));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nutrition-edit-title"
        className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl max-h-[min(92dvh,720px)] flex flex-col"
      >
        <div className="p-4 border-b border-zinc-800 shrink-0">
          <h2 id="nutrition-edit-title" className="text-lg font-semibold text-zinc-100">
            Edit diet log
          </h2>
          <p className="text-sm text-zinc-500 mt-1">{fmtDate(log.date, 'EEE, MMM d, yyyy')}</p>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          <p className="text-xs text-zinc-500">
            Calories follow macros (4 kcal/g protein &amp; carbs, 9 kcal/g fat). Same rules as Daily Check-In.
          </p>

          <DerivedCaloriesRow
            targetKcal={targetKcal}
            actualKcal={actualKcal}
            targetMacros={{ p: pT, c: cT, f: fT }}
            setActualMacros={{ setP: setPA, setC: setCA, setF: setFA }}
          />
          <MacroRow macro="Protein" unit="g" target={pT} setTarget={setPT} actual={pA} setActual={setPA} />
          <MacroRow macro="Carbs" unit="g" target={cT} setTarget={setCT} actual={cA} setActual={setCA} />
          <MacroRow macro="Fat" unit="g" target={fT} setTarget={setFT} actual={fA} setActual={setFA} />

          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-3">
            <div className="text-xs uppercase tracking-wider text-zinc-500">Meal check-ins</div>
            {log.mealsLoggedCount > 0 && log.mealTimestamps === undefined && (
              <p className="text-[11px] text-zinc-500">
                Earlier entry used manual meal count ({log.mealsLoggedCount}). Add check-ins below to track times.
              </p>
            )}
            <div className="flex flex-wrap gap-2 items-center">
              <button
                type="button"
                className="h-10 px-4 rounded-lg bg-emerald-600 text-zinc-950 text-sm font-medium"
                onClick={() => void logAteNow()}
              >
                Yes — log time
              </button>
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
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-2">
                  <div className="text-zinc-500">Occasions</div>
                  <div className="font-mono text-zinc-200 mt-0.5">{mealDerived.occasions}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-zinc-800 shrink-0 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-4 rounded-lg bg-zinc-800 text-sm text-zinc-300"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="h-11 px-4 rounded-lg bg-amber-500 text-zinc-950 font-medium text-sm disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
