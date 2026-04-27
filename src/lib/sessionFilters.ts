import type { ReadinessLog, SessionLog } from './types';

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
