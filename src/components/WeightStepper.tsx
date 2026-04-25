'use client';

import type { Equipment } from '@/lib/types';
import { snapBarbell, snapDbLoad } from '@/lib/progression';

type Props = {
  value: number;
  onChange: (n: number) => void;
  equipment: Equipment;
  increment?: number;
  /** Allow negative loads (e.g., assistance). */
  allowNegative?: boolean;
  unit?: string;
};

export function WeightStepper({ value, onChange, equipment, increment, allowNegative, unit = 'lb' }: Props) {
  const inc = increment ?? (equipment === 'dumbbell' ? 2.5 : 5);
  const min = allowNegative ? -200 : 0;

  const snap = (n: number) => {
    if (equipment === 'dumbbell') return Math.max(min, snapDbLoad(n));
    if (equipment === 'barbell')  return Math.max(min, snapBarbell(n));
    return Math.max(min, Math.round(n / inc) * inc);
  };

  const dec = () => onChange(snap(value - inc));
  const up  = () => onChange(snap(value + inc));

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={dec}
        className="h-12 w-12 rounded-xl bg-zinc-800 active:bg-zinc-700 text-2xl font-medium"
        aria-label="decrease"
      >−</button>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(snap(parseFloat(e.target.value || '0')))}
        className="h-12 w-24 rounded-xl bg-zinc-900 border border-zinc-800 text-center text-lg"
      />
      <button
        type="button"
        onClick={up}
        className="h-12 w-12 rounded-xl bg-zinc-800 active:bg-zinc-700 text-2xl font-medium"
        aria-label="increase"
      >+</button>
      <span className="text-zinc-500 text-sm ml-1">{unit}</span>
    </div>
  );
}

type RepProps = {
  value: number;
  onChange: (n: number) => void;
  unit?: string;
};

export function RepStepper({ value, onChange, unit = 'reps' }: RepProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className="h-12 w-12 rounded-xl bg-zinc-800 active:bg-zinc-700 text-2xl font-medium"
        aria-label="decrease"
      >−</button>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value || '0', 10)))}
        className="h-12 w-20 rounded-xl bg-zinc-900 border border-zinc-800 text-center text-lg"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="h-12 w-12 rounded-xl bg-zinc-800 active:bg-zinc-700 text-2xl font-medium"
        aria-label="increase"
      >+</button>
      <span className="text-zinc-500 text-sm ml-1">{unit}</span>
    </div>
  );
}
