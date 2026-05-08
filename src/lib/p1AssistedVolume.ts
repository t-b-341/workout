import type { BodyweightLog, ReadinessLog, SessionLog, SetLog, Lift } from '@/lib/types';

/** Logged `weight` is counterweight assistance (lb); negative = extra load (eccentric emphasis). */
export function effectiveP1AssistedConcentricLoadLb(assistLb: number, bodyweightLb: number): number {
  return Math.max(0, bodyweightLb - assistLb);
}

/** Logged `weight` is added load for `p1_bw`; 0 = bodyweight, positive = added load. */
export function effectiveP1BodyweightLoadLb(addedLoadLb: number, bodyweightLb: number): number {
  return Math.max(0, bodyweightLb + addedLoadLb);
}

export function latestBodyweightLbOnOrBefore(dateIso: string, logs: BodyweightLog[]): number | undefined {
  const sorted = [...logs].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });
  for (const log of sorted) {
    if (log.date <= dateIso && log.bodyweight > 0) return log.bodyweight;
  }
  return undefined;
}

/**
 * Bodyweight anchor for volume: same-session readiness scale weight, else latest
 * `bodyweight_logs` entry on or before the session date.
 */
export function bodyweightLbForSessionVolume(
  session: SessionLog,
  readiness: ReadinessLog | undefined,
  bodyweightLogs: BodyweightLog[],
): number | undefined {
  const fromReadiness = readiness?.bodyweight;
  if (fromReadiness != null && fromReadiness > 0) return fromReadiness;
  return latestBodyweightLbOnOrBefore(session.date, bodyweightLogs);
}

export function readinessBySessionId(readinessLogs: ReadinessLog[]): Map<string, ReadinessLog> {
  return new Map(readinessLogs.map((r) => [r.sessionLogId, r]));
}

/** Tonnage (lb) for one completed strength set in aggregates. `p1_assisted` uses BW − assist × reps. */
export function strengthVolumeLbForSet(
  set: SetLog,
  lift: Lift | undefined,
  bodyweightLb: number | undefined,
): number {
  if (set.status !== 'completed') return 0;
  if (!lift || lift.equipment === 'cardio' || lift.equipment === 'time') return 0;
  if (lift.id === 'p1_assisted') {
    if (bodyweightLb == null || bodyweightLb <= 0) return 0;
    const moved = effectiveP1AssistedConcentricLoadLb(set.weight, bodyweightLb);
    return moved * set.reps;
  }
  if (lift.id === 'p1_bw') {
    if (bodyweightLb == null || bodyweightLb <= 0) return 0;
    const moved = effectiveP1BodyweightLoadLb(set.weight, bodyweightLb);
    return moved * set.reps;
  }
  if (set.weight > 0) return set.weight * set.reps;
  return 0;
}
