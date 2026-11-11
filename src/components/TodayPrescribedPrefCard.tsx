'use client';

import {
  setHidePrescribed,
  useHidePrescribed,
  useDisabledTemplateIds,
  toggleTemplateDisabled,
  useDisabledMeasureFields,
  toggleMeasureFieldDisabled,
} from '@/lib/todayPrefs';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/lib/db';
import { sortTemplatesProgramOrder } from '@/lib/seed';

const MEASURE_FIELDS: { key: string; label: string }[] = [
  { key: 'waist', label: 'Waist (narrowest)' },
  { key: 'abdomen', label: 'Abdomen (navel)' },
  { key: 'hips', label: 'Hips (widest)' },
  { key: 'bicep', label: 'Bicep (flexed)' },
  { key: 'thigh', label: 'Thigh (mid, relaxed)' },
];

export function TodayPrescribedPrefCard() {
  const hidden = useHidePrescribed();
  const disabledIds = useDisabledTemplateIds();
  const templates = useLiveQuery(
    async () => (await getDb().templates.toArray()).filter((t) => t.id !== 'QUICK'),
    [],
  ) ?? [];
  const orderedTemplates = sortTemplatesProgramOrder(templates);

  async function toggle() {
    await setHidePrescribed(!hidden);
  }

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
      <div className="text-xs uppercase tracking-wider text-zinc-500">Today tab</div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-zinc-200">Hide prescribed sessions on Today</div>
          <p className="text-xs text-zinc-500 mt-1">
            Hides the scheduled-session prompt and planner on the Today tab. Your Quick Session and
            trackers stay. This device only.
          </p>
        </div>
        {hidden ? (
          <button
            type="button"
            aria-pressed="true"
            aria-label="Show prescribed sessions on Today"
            onClick={() => void toggle()}
            className="shrink-0 h-9 w-14 rounded-full relative transition-colors bg-amber-500"
          >
            <span className="absolute top-1 left-6 h-7 w-7 rounded-full bg-zinc-950 transition-[left]" />
          </button>
        ) : (
          <button
            type="button"
            aria-pressed="false"
            aria-label="Hide prescribed sessions on Today"
            onClick={() => void toggle()}
            className="shrink-0 h-9 w-14 rounded-full relative transition-colors bg-zinc-700"
          >
            <span className="absolute top-1 left-1 h-7 w-7 rounded-full bg-zinc-950 transition-[left]" />
          </button>
        )}
      </div>
      <div className="border-t border-zinc-800 pt-3 mt-1 space-y-2">
        <div className="text-sm font-medium text-zinc-200">Visible templates</div>
        <p className="text-xs text-zinc-500">
          Choose which prescribed workouts appear in the Today picker. Disabling all reverts to showing all. This device only.
        </p>
        <div className="space-y-1.5">
          {orderedTemplates.map((t) => {
            const enabled = !disabledIds.includes(t.id);
            return (
              <div key={t.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-sm text-zinc-200 font-mono">{t.id}</span>
                  <span className="text-xs text-zinc-500 ml-2">{t.name}</span>
                </div>
                <button
                  type="button"
                  aria-pressed={enabled}
                  aria-label={enabled ? `Hide ${t.id}` : `Show ${t.id}`}
                  onClick={() => void toggleTemplateDisabled(t.id)}
                  className={`shrink-0 h-7 w-12 rounded-full relative transition-colors ${enabled ? 'bg-amber-500' : 'bg-zinc-700'}`}
                >
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-zinc-950 transition-[left] ${enabled ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function VisibleMeasurementsCard() {
  const disabledMeasureFields = useDisabledMeasureFields();

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
      <div className="text-xs uppercase tracking-wider text-zinc-500">Visible measurements</div>
      <p className="text-xs text-zinc-500">
        Choose which measurement fields appear in the Weekly tracker. This device only.
      </p>
      <div className="space-y-1.5">
        {MEASURE_FIELDS.map((f) => {
          const enabled = !disabledMeasureFields.includes(f.key);
          return (
            <div key={f.key} className="flex items-center justify-between gap-3">
              <span className="text-sm text-zinc-200">{f.label}</span>
              <button
                type="button"
                aria-pressed={enabled}
                aria-label={enabled ? `Hide ${f.label}` : `Show ${f.label}`}
                onClick={() => void toggleMeasureFieldDisabled(f.key)}
                className={`shrink-0 h-7 w-12 rounded-full relative transition-colors ${enabled ? 'bg-amber-500' : 'bg-zinc-700'}`}
              >
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-zinc-950 transition-[left] ${enabled ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
