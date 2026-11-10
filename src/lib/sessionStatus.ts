import type { ReadinessLog, SessionLog, SessionStatus, SetLog, TemplateId } from './types';

export type { SessionStatus } from './types';

/** Sum of prescription `sets` for a template (programmed volume). */
export function programmedSetsForTemplate(
  templateId: TemplateId,
  prescriptions: ReadonlyArray<{ templateId: TemplateId; sets: number }>,
): number {
  let n = 0;
  for (const p of prescriptions) {
    if (p.templateId === templateId) n += p.sets;
  }
  return n;
}

/**
 * Derives status from logs + prescriptions. Respects user-skipped sessions.
 * - `skipped` — stored `sessionStatus === 'skipped'`, or `mode === 'skip'` with no work logged
 * - `ghost` — no set rows for this session (and not skipped)
 * - `partial` / `completed` — completed sets vs programmed sets threshold (50%)
 */
export function deriveSessionStatus(
  session: SessionLog,
  prescriptions: ReadonlyArray<{ templateId: TemplateId; sets: number }>,
  setsForSession: SetLog[],
): SessionStatus {
  if (session.sessionStatus === 'skipped') {
    return 'skipped';
  }

  const rows = setsForSession.filter((st) => st.sessionLogId === session.id);
  if (rows.length === 0) {
    return session.mode === 'skip' ? 'skipped' : 'ghost';
  }

  const programmed = programmedSetsForTemplate(session.templateId, prescriptions);
  const completed = rows.filter((st) => st.status === 'completed').length;

  if (programmed <= 0) {
    return completed > 0 ? 'completed' : 'partial';
  }

  const pct = (completed / programmed) * 100;
  if (pct < 50) return 'partial';
  return 'completed';
}

export function isGhostSessionStatus(status: SessionStatus): boolean {
  return status === 'ghost';
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasReadinessForSession(
  sessionId: string,
  readiness: ReadinessLog | readonly ReadinessLog[] | null | undefined,
): boolean {
  if (readiness == null) return false;
  const rows = Array.isArray(readiness) ? readiness : [readiness];
  return rows.some((row) => row.sessionLogId === sessionId);
}

/**
 * A session row created by viewing Today, with no training data attached.
 * Sets and readiness are matched by `sessionLogId`, so callers may pass the
 * full tables. True only when every signal of a real session is absent.
 */
export function isEmptySession(
  session: SessionLog,
  sets: readonly SetLog[],
  readiness: ReadinessLog | readonly ReadinessLog[] | null | undefined,
): boolean {
  if (session.startedAt) return false;
  if (session.completedAt) return false;
  if (hasText(session.reason) || hasText(session.notes)) return false;
  if (session.mode === 'skip') return false;
  if (session.sessionStatus === 'skipped') return false;
  if (sets.some((set) => set.sessionLogId === session.id)) return false;
  if (hasReadinessForSession(session.id, readiness)) return false;
  return true;
}
