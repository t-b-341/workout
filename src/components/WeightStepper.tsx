'use client';

import { useState } from 'react';
import type { Lift } from '@/lib/types';
import { clampHalfStepRir } from '@/lib/rpe';
import { snapWorkingWeight, type SnapLiftRef } from '@/lib/progression';

/** Keep a text buffer in sync with external numeric `value` whenever the field is not focused. */
function useBlurSyncedNumericText(
  value: number,
  toText: (n: number) => string,
): {
  setFocused: (v: boolean) => void;
  text: string;
  setText: (v: string) => void;
} {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => toText(value));
  const syncKey = `${value}|${focused}`;
  const [syncKeySeen, setSyncKeySeen] = useState(syncKey);
  if (syncKey !== syncKeySeen) {
    setSyncKeySeen(syncKey);
    if (!focused) setText(toText(value));
  }
  return { setFocused, text, setText };
}

type StepperA11y = {
  input?: string;
  decrease?: string;
  increase?: string;
};

type Props = {
  lift: SnapLiftRef & Pick<Lift, 'increment'>;
  value: number;
  onChange: (n: number) => void;
  /** Prescription increment when it differs from the lift default. */
  stepIncrement?: number;
  allowNegative?: boolean;
  unit?: string;
  labels?: StepperA11y;
};

export function WeightStepper({
  lift,
  value,
  onChange,
  stepIncrement,
  allowNegative,
  unit = 'lb',
  labels,
}: Props) {
  const inc =
    stepIncrement ??
    lift.increment ??
    (lift.equipment === 'dumbbell' || lift.equipment === 'carry' ? 2.5 : 5);
  const min = allowNegative ? -200 : 0;

  const snap = (n: number) => {
    const snapped = snapWorkingWeight(n, lift);
    return Math.max(min, snapped);
  };

  const dec = () => onChange(snap(value - inc));
  const up = () => onChange(snap(value + inc));

  const { setFocused, text, setText } = useBlurSyncedNumericText(value, String);

  function commit() {
    const t = text.trim();
    if (t === '' || t === '-' || t === '.' || t === '-.') {
      onChange(snap(0));
      return;
    }
    const n = parseFloat(t);
    onChange(snap(Number.isFinite(n) ? n : 0));
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={dec}
        className="h-12 w-12 rounded-xl bg-zinc-800 active:bg-zinc-700 text-2xl font-medium"
        aria-label={labels?.decrease ?? 'decrease'}
      >−</button>
      <input
        type="text"
        inputMode="decimal"
        aria-label={labels?.input}
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          commit();
          setFocused(false);
        }}
        onChange={(e) => {
          let v = e.target.value;
          if (!allowNegative) {
            v = v.replace(/[^\d.]/g, '');
            const firstDot = v.indexOf('.');
            if (firstDot !== -1) {
              v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '');
            }
          } else {
            v = v.replace(/[^\d.-]/g, '');
            const minus = v.startsWith('-') ? '-' : '';
            const rest = (v.startsWith('-') ? v.slice(1) : v).replace(/-/g, '');
            const fd = rest.indexOf('.');
            let body = rest;
            if (fd !== -1) {
              body = rest.slice(0, fd + 1) + rest.slice(fd + 1).replace(/\./g, '');
            }
            v = minus + body;
          }
          setText(v);
        }}
        className="h-12 w-24 rounded-xl bg-zinc-900 border border-zinc-800 text-center text-lg"
      />
      <button
        type="button"
        onClick={up}
        className="h-12 w-12 rounded-xl bg-zinc-800 active:bg-zinc-700 text-2xl font-medium"
        aria-label={labels?.increase ?? 'increase'}
      >+</button>
      <span className="text-zinc-500 text-sm ml-1">{unit}</span>
    </div>
  );
}

type RepProps = {
  value: number;
  onChange: (n: number) => void;
  unit?: string;
  labels?: StepperA11y;
};

export function RepStepper({ value, onChange, unit = 'reps', labels }: RepProps) {
  const { setFocused, text, setText } = useBlurSyncedNumericText(value, String);

  function commit() {
    const t = text.trim();
    if (t === '') onChange(0);
    else {
      const n = parseInt(t, 10);
      onChange(Number.isFinite(n) ? Math.max(0, n) : 0);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className="h-12 w-12 rounded-xl bg-zinc-800 active:bg-zinc-700 text-2xl font-medium"
        aria-label={labels?.decrease ?? 'decrease'}
      >−</button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={labels?.input}
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          commit();
          setFocused(false);
        }}
        onChange={(e) => {
          const v = e.target.value;
          if (!/^\d*$/.test(v)) return;
          setText(v);
        }}
        className="h-12 w-20 rounded-xl bg-zinc-900 border border-zinc-800 text-center text-lg"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="h-12 w-12 rounded-xl bg-zinc-800 active:bg-zinc-700 text-2xl font-medium"
        aria-label={labels?.increase ?? 'increase'}
      >+</button>
      <span className="text-zinc-500 text-sm ml-1">{unit}</span>
    </div>
  );
}

type RirProps = {
  value: number;
  onChange: (n: number) => void;
  /** Narrower controls for dense layouts (e.g. session edit sheet). */
  compact?: boolean;
  labels?: StepperA11y;
};

export function RirStepper({ value, onChange, compact, labels }: RirProps) {
  const snapped = clampHalfStepRir(value);
  const { setFocused, text, setText } = useBlurSyncedNumericText(value, (n) =>
    String(clampHalfStepRir(n)),
  );

  function commit() {
    const t = text.trim();
    if (t === '' || t === '-' || t === '.' || t === '-.') {
      onChange(0);
      return;
    }
    const n = parseFloat(t);
    onChange(Number.isFinite(n) ? clampHalfStepRir(n) : 0);
  }

  const dec = () => onChange(clampHalfStepRir(snapped - 0.5));
  const inc = () => onChange(clampHalfStepRir(snapped + 0.5));

  const btn = compact ? 'h-9 w-9 text-xl' : 'h-12 w-12 text-2xl';
  const inp = compact ? 'h-9 w-20 text-sm' : 'h-12 w-20 text-lg';

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={dec}
        className={`rounded-xl bg-zinc-800 active:bg-zinc-700 font-medium ${btn}`}
        aria-label={labels?.decrease ?? 'decrease RIR'}
      >−</button>
      <input
        type="text"
        inputMode="decimal"
        aria-label={labels?.input}
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          commit();
          setFocused(false);
        }}
        onChange={(e) => {
          let v = e.target.value.replace(/[^\d.]/g, '');
          const fd = v.indexOf('.');
          if (fd !== -1) {
            v = v.slice(0, fd + 1) + v.slice(fd + 1).replace(/\./g, '');
          }
          setText(v);
        }}
        className={`rounded-xl bg-zinc-950 border border-zinc-800 px-2 text-center font-mono text-zinc-200 ${inp}`}
      />
      <button
        type="button"
        onClick={inc}
        className={`rounded-xl bg-zinc-800 active:bg-zinc-700 font-medium ${btn}`}
        aria-label={labels?.increase ?? 'increase RIR'}
      >+</button>
    </div>
  );
}

/** Integers only; empty while typing; commit on blur (defaults invalid empty to `min`). */
export function LooseIntField({
  value,
  onCommit,
  min = 0,
  max = 9999,
  className,
  'aria-label': ariaLabel,
}: {
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  max?: number;
  className?: string;
  'aria-label'?: string;
}) {
  const { setFocused, text, setText } = useBlurSyncedNumericText(value, String);

  function commit() {
    const t = text.trim();
    const parsed = t === '' ? NaN : parseInt(t, 10);
    const n = Number.isFinite(parsed) ? parsed : min;
    onCommit(Math.min(max, Math.max(min, n)));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      aria-label={ariaLabel}
      className={className}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        commit();
        setFocused(false);
      }}
      onChange={(e) => setText(e.target.value.replace(/\D/g, ''))}
    />
  );
}

function clampStepped(value: number, step: number, min: number, max?: number): number {
  let v = Math.max(min, value);
  if (max != null) v = Math.min(max, v);
  const snapped = Math.round(v / step) * step;
  const stepDecimals = (step.toString().split('.')[1] ?? '').length;
  return stepDecimals > 0 ? Number(snapped.toFixed(stepDecimals)) : snapped;
}

/** Decimal +/- stepper with typed middle field (commits on blur). */
export function DecimalStepper({
  value,
  onChange,
  step,
  min,
  max,
  unit,
  inputClassName,
  labels,
  touch,
}: {
  value: number;
  onChange: (n: number) => void;
  step: number;
  min: number;
  max?: number;
  unit?: string;
  inputClassName?: string;
  labels?: StepperA11y;
  /** 48px controls for the in-session lift card. */
  touch?: boolean;
}) {
  function clamp(n: number): number {
    return clampStepped(n, step, min, max);
  }

  const dec = () => onChange(clamp(value - step));
  const inc = () => onChange(clamp(value + step));

  const { setFocused, text, setText } = useBlurSyncedNumericText(value, String);

  function commit() {
    const t = text.trim();
    if (t === '' || t === '-' || t === '.' || t === '-.') {
      onChange(clamp(min));
      return;
    }
    const n = parseFloat(t);
    onChange(clamp(Number.isFinite(n) ? n : min));
  }

  const btn = touch
    ? 'h-12 w-12 shrink-0 rounded-xl bg-zinc-800 active:bg-zinc-700 text-2xl font-medium leading-none'
    : 'h-10 w-10 shrink-0 rounded-lg bg-zinc-800 active:bg-zinc-700 text-lg font-medium leading-none';
  const field = touch
    ? 'flex-1 min-w-0 h-12 rounded-xl bg-zinc-950 border border-zinc-800 px-2 font-mono text-base text-center'
    : inputClassName ??
      'flex-1 min-w-0 h-10 rounded-lg bg-zinc-950 border border-zinc-800 px-2 font-mono text-sm text-center';

  return (
    <div className="flex items-center gap-1.5 w-full">
      <button
        type="button"
        onClick={dec}
        className={btn}
        aria-label={labels?.decrease ?? 'decrease'}
      >
        −
      </button>
      <input
        type="text"
        inputMode="decimal"
        aria-label={labels?.input}
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          commit();
          setFocused(false);
        }}
        onChange={(e) => {
          let v = e.target.value;
          v = v.replace(/[^\d.]/g, '');
          const firstDot = v.indexOf('.');
          if (firstDot !== -1) {
            v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '');
          }
          setText(v);
        }}
        className={field}
      />
      <button
        type="button"
        onClick={inc}
        className={btn}
        aria-label={labels?.increase ?? 'increase'}
      >
        +
      </button>
      {unit ? <span className="text-[10px] text-zinc-500 shrink-0 w-8">{unit}</span> : null}
    </div>
  );
}

/** Decimal; empty while typing; commit on blur. */
export function LooseDecimalField({
  value,
  onCommit,
  className,
  allowNegative,
  'aria-label': ariaLabel,
}: {
  value: number;
  onCommit: (n: number) => void;
  className?: string;
  allowNegative?: boolean;
  'aria-label'?: string;
}) {
  const { setFocused, text, setText } = useBlurSyncedNumericText(value, String);

  function commit() {
    const t = text.trim();
    if (t === '' || t === '-' || t === '.' || t === '-.') {
      onCommit(0);
      return;
    }
    const n = parseFloat(t);
    onCommit(Number.isFinite(n) ? n : 0);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      aria-label={ariaLabel}
      className={className}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        commit();
        setFocused(false);
      }}
      onChange={(e) => {
        let v = e.target.value;
        if (!allowNegative) {
          v = v.replace(/[^\d.]/g, '');
          const firstDot = v.indexOf('.');
          if (firstDot !== -1) {
            v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '');
          }
        } else {
          v = v.replace(/[^\d.-]/g, '');
          const minus = v.startsWith('-') ? '-' : '';
          const rest = (v.startsWith('-') ? v.slice(1) : v).replace(/-/g, '');
          const fd = rest.indexOf('.');
          let body = rest;
          if (fd !== -1) {
            body = rest.slice(0, fd + 1) + rest.slice(fd + 1).replace(/\./g, '');
          }
          v = minus + body;
        }
        setText(v);
      }}
    />
  );
}
