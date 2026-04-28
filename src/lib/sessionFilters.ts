import type { Prescription, ReadinessLog, SessionLog, SetLog } from './types';

/** Stable display / edit order: prescription template order, then set index, then L/R. */
export function sortSetLogsForSession(sets: SetLog[], prescriptions: Prescription[]): SetLog[] {
  const sortedRx = [...prescriptions].sort((a, b) => a.order - b.order);
  const order = new Map(sortedRx.map((p, i) => [p.id, i]));
  const sideRank = (s: SetLog) => (s.side === 'L' ? 0 : s.side === 'R' ? 1 : 2);
  return [...sets].sort((a, b) => {
    const oa = order.get(a.prescriptionId) ?? 999;
    const ob = order.get(b.prescriptionId) ?? 999;
    if (oa !== ob) return oa - ob;
    if (a.setIndex !== b.setIndex) return a.setIndex - b.setIndex;
    return sideRank(a) - sideRank(b);
  });
}

/**
 * Sessions that count toward History / trends: readiness finished (form or skip),
 * or a readiness log exists, or legacy rows that already have training timestamps.
 */
export function filterSessionsAfterReadiness(
  sessions: SessionLog[],
  readinessLogs: ReadinessLog[],
): SessionLog[] {
  const readinessIds = new Set(readinessLogs.map((r) => r.sessionLogId));
  return sessions.filter((s) => {
    if (s.readinessCompletedAt) return true;
    if (readinessIds.has(s.id)) return true;
    if (s.startedAt || s.completedAt) return true;
    return false;
  });
}
