'use client';

import { useEffect, useMemo } from 'react';
import type { MesocycleConfig } from '@/lib/mesocycle';
import { fmtDate } from '@/lib/time';
import { buildScheduledWorkoutPreview, type ScheduledWorkoutPreviewRow } from '@/lib/scheduleWorkoutPreview';
import { writeTodayPlanPreference } from '@/lib/todayPlanPreference';
import type { Lift, Prescription, SessionLog, SessionTemplate, SetLog, TemplateId } from '@/lib/types';

/** Row from Program schedule (`ProgramEditor` → `buildSchedule`). */
export type ScheduleWorkoutPeekRow = {
  date: string;
  template: SessionTemplate;
  status: 'completed' | 'today' | 'upcoming' | 'missed' | 'partial';
};

type Props = {
  row: ScheduleWorkoutPeekRow | null;
  onClose: () => void;
  /** Prescriptions for `row.template.id` only (`undefined` until indexed). */
  templatePrescriptions: Prescription[] | undefined;
  lifts: Lift[];
  meso: MesocycleConfig | undefined;
  setLogs?: SetLog[];
  sessions?: SessionLog[];
  onSelectTemplate: (id: TemplateId) => void;
};

export function ScheduleWorkoutSheet({
  row,
  onClose,
  templatePrescriptions,
  lifts,
  meso,
  setLogs,
  sessions,
  onSelectTemplate,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const preview = useMemo(() => {
    if (!row || !lifts?.length || templatePrescriptions === undefined) return null;
    return buildScheduledWorkoutPreview(
      row.date,
      row.template.id,
      templatePrescriptions,
      lifts,
      meso,
      setLogs,
      sessions,
    );
  }, [row, templatePrescriptions, lifts, meso, setLogs, sessions]);

  if (!row) return null;

  const rxLoading = Boolean(lifts?.length && templatePrescriptions === undefined);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-workout-title"
        className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl max-h-[min(92dvh,720px)] flex flex-col"
      >
        <div className="p-4 border-b border-zinc-800 shrink-0">
          <h2 id="schedule-workout-title" className="text-lg font-semibold text-zinc-100">
            {fmtDate(row.date, 'EEEE, MMM d')}
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            {row.template.id} · {(row.template.name.split('—')[1] ?? row.template.name).trim()}
          </p>
          <p className="text-xs text-zinc-500 mt-3 leading-relaxed">
            Estimated from your <span className="text-zinc-400">saved program today</span> — no progression assumed for future sessions.
            {preview?.isMesoDeloadDay && (
              <>
                {' '}
                Meso deload week: loads and accessory volume reflect standard deload from those current weights.
              </>
            )}
          </p>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {!lifts?.length || rxLoading ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : preview && preview.rows.length === 0 ? (
            <p className="text-sm text-zinc-500">No exercises in this template yet.</p>
          ) : preview ? (
            <ul className="space-y-2">
              {preview.rows.map((r) => (
                <ScheduledLiftLine key={r.baseline.id} row={r} />
              ))}
            </ul>
          ) : null}
        </div>

        <div className="p-4 border-t border-zinc-800 shrink-0 space-y-2">
          {row.status === 'today' && (
            <button
              type="button"
              className="w-full h-11 rounded-xl bg-amber-500 text-zinc-950 text-sm font-semibold"
              onClick={() => {
                writeTodayPlanPreference({ date: row.date, templateId: row.template.id });
                onSelectTemplate(row.template.id);
                onClose();
              }}
            >
              Use this day&apos;s workout on Today · {row.template.id}
            </button>
          )}
          <button
            type="button"
            className="w-full h-11 rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-200 text-sm font-medium hover:bg-zinc-800 transition-colors"
            onClick={() => {
              onSelectTemplate(row.template.id);
              onClose();
            }}
          >
            Jump to Program editor ({row.template.id})
          </button>
          <button
            type="button"
            className="w-full h-10 rounded-xl text-zinc-500 text-sm hover:text-zinc-300"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ScheduledLiftLine({ row }: { row: ScheduledWorkoutPreviewRow }) {
  const { lift, displayed: p } = row;
  const load = formatPreviewLoadText(p, lift);
  const intensity = formatIntensityLine(lift, p);

  return (
    <li className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="text-sm font-medium text-zinc-100 shrink-0">{lift.name}</span>
      <span className="text-xs text-zinc-500">{p.sets}×</span>
      <span className="text-xs text-zinc-400">{intensity}</span>
      <span className="text-xs text-zinc-300 ml-auto">{load}</span>
    </li>
  );
}

function formatIntensityLine(lift: Lift, p: Prescription): string {
  if (lift.equipment === 'cardio') {
    if (lift.id === 'liss') return formatMinutesBand(p.repMin, p.repMax);
    return formatRoundsBand(p.repMin, p.repMax);
  }
  if (lift.repUnit === 'seconds') return formatSecondsBand(p.repMin, p.repMax);
  if (lift.repUnit === 'minutes') return formatMinutesBand(p.repMin, p.repMax);
  return formatRepBand(p.repMin, p.repMax);
}

function formatRepBand(lo: number, hi: number): string {
  if (lo === hi) return `${lo} reps`;
  return `${lo}–${hi} reps`;
}

function formatRoundsBand(lo: number, hi: number): string {
  if (lo === hi) return `${lo} rounds`;
  return `${lo}–${hi} rounds`;
}

function formatMinutesBand(lo: number, hi: number): string {
  if (lo === hi) return `${lo} min`;
  return `${lo}–${hi} min`;
}

function formatSecondsBand(lo: number, hi: number): string {
  if (lo === hi) return `${lo}s`;
  return `${lo}–${hi}s`;
}

function formatPreviewLoadText(p: Prescription, lift: Lift): string {
  if (lift.repUnit === 'seconds') {
    return p.weight === 0 ? '—' : `${p.weight} lb`;
  }
  if (lift.equipment === 'cardio' && lift.loadUnit === 'none' && p.weight === 0) {
    return '—';
  }
  if (lift.loadUnit === 'none' && p.weight === 0) {
    return '—';
  }
  let w = `${p.weight}`;
  if (p.perSide) w += ' lb/side';
  else w += ' lb';
  if (lift.loadUnit === 'bodyweight' && lift.id !== 'p1_assisted') w += ' added';
  if (lift.id === 'p1_assisted' && p.weight > 0) w += ' assist';
  if (lift.id === 'p1_assisted' && p.weight < 0) w += ' eccentric';
  return w;
}
