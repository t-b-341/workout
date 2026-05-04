import { getDb } from './db';
import type { SessionFinishHighlights, SessionRecapPRItem } from './stats';
import {
  sessionDurationMs,
  sessionFinishHighlights,
  sessionRecapPRs,
  sessionStrengthDensity,
} from './stats';
import type { SessionLog } from './types';

export type SessionRecapPayload = {
  session: SessionLog;
  templateName: string;
  prs: SessionRecapPRItem[];
  durationMs: number | null;
  strengthLbPerHour: number | null;
  progression: { advanced: number; held: number; skipped: number };
  highlights: SessionFinishHighlights;
  /**
   * Opened via “View recap” after prescriptions may have changed — progression
   * counts are not shown; summary lines skip progression-specific copy.
   */
  replay: boolean;
};

/**
 * Build recap data for a **completed** session (`completedAt` set).
 * Pass `progression: null` for a replay (after finish); progression UI is hidden.
 */
export async function buildSessionRecapPayload(opts: {
  session: SessionLog;
  progression: { advanced: number; held: number; skipped: number } | null;
}): Promise<SessionRecapPayload | null> {
  const { session } = opts;
  if (!session.completedAt) return null;

  const replay = opts.progression === null;
  const progression = opts.progression ?? { advanced: 0, held: 0, skipped: 0 };

  const db = getDb();
  const sessionSets = await db.set_logs.where('sessionLogId').equals(session.id).toArray();
  const allSets = await db.set_logs.toArray();
  const allSessions = await db.session_logs.toArray();
  const lifts = await db.lifts.toArray();
  const bodyweightLogs = await db.bodyweight_logs.toArray();
  const readinessLogs = await db.readiness_logs.toArray();
  const tmpl = await db.templates.get(session.templateId);

  const prs = sessionRecapPRs(session.id, allSets, allSessions, lifts, bodyweightLogs, readinessLogs);
  const highlights = sessionFinishHighlights(session, sessionSets, lifts, bodyweightLogs, readinessLogs);
  const { lbPerHour: strengthLbPerHour } = sessionStrengthDensity(
    session,
    sessionSets,
    lifts,
    bodyweightLogs,
    readinessLogs,
  );
  const durationMs = sessionDurationMs(session, sessionSets);

  return {
    session,
    templateName: tmpl?.name ?? session.templateId,
    prs,
    durationMs,
    strengthLbPerHour,
    progression,
    highlights,
    replay,
  };
}
