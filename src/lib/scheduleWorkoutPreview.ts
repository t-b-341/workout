import { applyStandardDeload } from '@/lib/deload';
import { mesocyclePosition, type MesocycleConfig } from '@/lib/mesocycle';
import { liftForSnap, snapWorkingWeight } from '@/lib/progression';
import { mostRecentWorkingWeight } from '@/lib/stats';
import type { Lift, Prescription, SessionLog, SetLog, TemplateId } from '@/lib/types';

export type ScheduledWorkoutPreviewRow = {
  lift: Lift;
  /** Stored program row (baseline). */
  baseline: Prescription;
  /** Shown loads/volume: today's program baseline, optional meso deload, snapped weight. */
  displayed: Prescription;
};

export type ScheduledWorkoutPreview = {
  rows: ScheduledWorkoutPreviewRow[];
  /** Meso calendar marks this calendar day as a deload week; applies standard deload to preview. */
  isMesoDeloadDay: boolean;
};

/**
 * Read-only projection for Schedule / Program: uses **current** saved prescriptions — no hypothetical progression.
 * Meso **deload** weeks apply `applyStandardDeload` off those current numbers (gets more accurate as you train and weights update).
 */
export function buildScheduledWorkoutPreview(
  dateIso: string,
  templateId: TemplateId,
  templatePrescriptions: Prescription[],
  lifts: Lift[],
  mesoCfg: MesocycleConfig | undefined,
  setLogs?: SetLog[],
  sessions?: SessionLog[],
): ScheduledWorkoutPreview {
  const liftMap = new Map(lifts.map((l) => [l.id, l]));
  const isMesoDeloadDay =
    mesoCfg != null ? Boolean(mesocyclePosition(dateIso, mesoCfg)?.isDeload) : false;

  const rows: ScheduledWorkoutPreviewRow[] = [];
  if (!templatePrescriptions.length || !lifts.length) {
    return { rows, isMesoDeloadDay };
  }

  for (const p of templatePrescriptions) {
    if (p.templateId !== templateId) continue;
    const lift = liftMap.get(p.liftId);
    if (!lift) continue;

    const recentWorkingWeight =
      setLogs && sessions ? mostRecentWorkingWeight(p.liftId, setLogs, sessions) : undefined;
    const adjusted = isMesoDeloadDay
      ? applyStandardDeload(p, lift, recentWorkingWeight)
      : { ...p };
    const weight = snapWorkingWeight(adjusted.weight, liftForSnap(p.liftId));
    rows.push({
      lift,
      baseline: p,
      displayed: { ...adjusted, weight },
    });
  }

  return { rows, isMesoDeloadDay };
}
