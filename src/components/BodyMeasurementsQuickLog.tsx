'use client';

import { useMemo, useState } from 'react';
import { useAllBodyMeasurements, useBodyMeasurementsForDate } from '@/lib/hooks';
import { flushDirty, localUpsert } from '@/lib/sync';
import { MEASUREMENT_TIME_OF_DAY } from '@/lib/types';
import type { BodyMeasurementLog, MeasurementTimeOfDay } from '@/lib/types';

type Props = {
  date: string;
};

export function BodyMeasurementsQuickLog({ date }: Props) {
  const todayRow = useBodyMeasurementsForDate(date);
  const all = useAllBodyMeasurements();
  const seed = useMemo(() => {
    const latest = all && all.length > 0 ? all[all.length - 1] : null;
    return {
      waist: todayRow?.waist ?? latest?.waist ?? 38,
      abdomen: todayRow?.abdomen ?? latest?.abdomen ?? 40,
      hips: todayRow?.hips ?? latest?.hips ?? 41,
      bicep: todayRow?.bicep ?? latest?.bicep,
      thigh: todayRow?.thigh ?? latest?.thigh,
      protocol: todayRow?.protocol ?? latest?.protocol ?? '',
      timeOfDay: todayRow?.timeOfDay ?? latest?.timeOfDay ?? null,
    };
  }, [todayRow, all]);

  const formKey = useMemo(
    () =>
      `measure:${date}:${todayRow?.waist ?? seed.waist}:${todayRow?.abdomen ?? seed.abdomen}:${todayRow?.hips ?? seed.hips}:${todayRow?.bicep ?? ''}:${todayRow?.thigh ?? ''}:${todayRow?.protocol ?? seed.protocol}:${todayRow?.timeOfDay ?? seed.timeOfDay ?? ''}`,
    [date, todayRow, seed],
  );

  return <BodyMeasurementsQuickLogForm key={formKey} date={date} initial={seed} hasToday={Boolean(todayRow)} />;
}

function BodyMeasurementsQuickLogForm({
  date,
  initial,
  hasToday,
}: {
  date: string;
  initial: {
    waist: number;
    abdomen: number;
    hips: number;
    bicep?: number;
    thigh?: number;
    protocol: string;
    timeOfDay: MeasurementTimeOfDay | null;
  };
  hasToday: boolean;
}) {
  const [waist, setWaist] = useState(initial.waist);
  const [abdomen, setAbdomen] = useState(initial.abdomen);
  const [hips, setHips] = useState(initial.hips);
  const [bicepStr, setBicepStr] = useState(
    initial.bicep != null ? String(initial.bicep) : '',
  );
  const [thighStr, setThighStr] = useState(
    initial.thigh != null ? String(initial.thigh) : '',
  );
  const [protocol, setProtocol] = useState(initial.protocol);
  const [timeOfDay, setTimeOfDay] = useState<MeasurementTimeOfDay | null>(initial.timeOfDay ?? null);

  async function save() {
    const row: BodyMeasurementLog = {
      id: `measure-${date}`,
      date,
      waist,
      abdomen,
      hips,
      bicep: bicepStr.trim() === '' ? undefined : Number(bicepStr),
      thigh: thighStr.trim() === '' ? undefined : Number(thighStr),
    };
    const p = protocol.trim();
    if (p) row.protocol = p;
    if (timeOfDay) row.timeOfDay = timeOfDay;
    await localUpsert('body_measurement_logs', row);
    await flushDirty().catch(() => {});
  }

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div>
        <div className="text-xs uppercase tracking-wider text-zinc-500">Body measurements</div>
        <div className="text-sm font-medium text-zinc-200 mt-0.5">Weekly tracker</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <MeasureInput label="Waist (narrowest)" value={waist} onChange={setWaist} />
        <MeasureInput label="Abdomen (navel)" value={abdomen} onChange={setAbdomen} />
        <MeasureInput label="Hips (widest)" value={hips} onChange={setHips} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="text-xs text-zinc-500">
          Bicep (flexed)
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={bicepStr}
            onChange={(e) => setBicepStr(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 text-center font-mono text-sm"
          />
        </label>
        <label className="text-xs text-zinc-500">
          Thigh (mid, relaxed)
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={thighStr}
            onChange={(e) => setThighStr(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 text-center font-mono text-sm"
          />
        </label>
      </div>
      <label className="block text-xs text-zinc-500">
        Protocol (optional)
        <input
          type="text"
          value={protocol}
          onChange={(e) => setProtocol(e.target.value)}
          placeholder="e.g. morning, fasted, after bathroom"
          className="mt-1 h-10 w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 text-sm text-zinc-200"
        />
      </label>
      <label className="block text-xs text-zinc-500">
        Time of day
        <select
          value={timeOfDay ?? ''}
          onChange={(e) =>
            setTimeOfDay(
              e.target.value === '' ? null : (e.target.value as MeasurementTimeOfDay),
            )
          }
          className="mt-1 h-10 w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 text-sm text-zinc-200"
        >
          <option value="">—</option>
          {MEASUREMENT_TIME_OF_DAY.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          className="h-11 px-4 rounded-lg bg-zinc-800 text-sm font-medium"
        >
          {hasToday ? 'Update measurements' : 'Save measurements'}
        </button>
        <span className="text-xs text-zinc-500">inches</span>
      </div>
    </div>
  );
}

function MeasureInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="text-xs text-zinc-500">
      {label}
      <input
        type="number"
        inputMode="decimal"
        step="0.1"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value || '0'))}
        className="mt-1 h-10 w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 text-center font-mono text-sm"
      />
    </label>
  );
}
